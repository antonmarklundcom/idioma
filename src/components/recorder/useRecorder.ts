'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// PLAN.md §4.1 / §6.3: this cap is load-bearing. It used to be a second line of defence
// behind Vercel's ~4.5MB request body limit; on Hostinger no platform ceiling exists, so
// it is now the ONLY bound on upload size. 90s of Opus is roughly 1MB. Don't raise it
// without adding a server-side length check on audioBase64.
export const MAX_RECORDING_SECONDS = 90;

// --- Endpointing (PLAN.md §8 Phase 7B items 2 + 3) ---------------------------------
// One AnalyserNode drives three things: the level meter it was built for, silence
// trimming, and the hands-free auto-stop. All thresholds are derived from a noise floor
// measured at the start of THIS recording - a phone in a cafe and a phone in a bedroom
// have wildly different floors, and a hardcoded number is wrong in one of them.

/** How long we listen before deciding what "quiet" sounds like here. */
const NOISE_FLOOR_CALIBRATION_MS = 300;
/** Speech is this much louder than the measured floor... */
const NOISE_FLOOR_MULTIPLIER = 1.8;
/** ...and at least this far above it in absolute terms, for a near-silent room. */
const NOISE_FLOOR_MARGIN = 0.02;
/** Absolute floor under the derived threshold, so mic noise alone never counts as speech. */
const MIN_SPEECH_THRESHOLD = 0.035;
/**
 * If the learner hasn't started talking by now, record anyway. Calibration can land on
 * a loud moment and set the bar too high; recording nothing at all is the one failure
 * this feature must never produce.
 */
const SPEECH_ONSET_GRACE_MS = 2500;
/**
 * Silence longer than this is excised from the recording via MediaRecorder.pause().
 * That is how "trim leading and trailing silence" is done without re-encoding: the
 * bytes are never written in the first place, so the upload stays Opus/AAC instead of
 * being decoded to PCM and ballooning (PLAN.md §8 Phase 7B item 3).
 */
const SILENCE_PAUSE_MS = 700;
/** Hands-free auto-stop: end the turn after this much silence (PLAN.md §8 Phase 7B item 2). */
export const SILENCE_STOP_MS = 1500;
/**
 * Hands-free only: give up on a turn nobody started.
 *
 * The auto-stop arms on `sawSpeech`, so a mic opened between turns that never hears
 * anything used to keep capturing until the 90s cap, upload 90 seconds of silence,
 * get a reply to nothing, and - because the loop hands the mic back after every
 * reply - do it again. That is a metered turn per cycle for a learner who has walked
 * away from the phone. Now the mic simply closes and sends nothing; the next turn is
 * a deliberate tap, exactly like the first one.
 */
const NO_SPEECH_TIMEOUT_MS = 8000;
/**
 * How long to wait for a suspended AudioContext to come alive before giving up on the
 * analyser. The context is created after the getUserMedia await - outside the tap
 * gesture's call stack - so iOS Safari starts it 'suspended' and may refuse resume().
 * A suspended analyser reads all zeros, which calibration mistakes for a dead-quiet
 * room and the silence trimmer for an endless pause: without this fallback every iOS
 * recording gets paused ~0.7s in and never resumed.
 */
const AUDIO_GRAPH_GRACE_MS = 250;

export type RecorderStatus =
  | 'idle'
  | 'requesting'
  /** Mic is open and calibrating/waiting for speech - nothing is being written yet. */
  | 'listening'
  | 'recording'
  | 'stopped'
  | 'error';

type EndpointPhase = 'calibrating' | 'waiting' | 'capturing';

type EndpointState = {
  phase: EndpointPhase;
  openedAt: number;
  floorSamples: number[];
  threshold: number;
  lastVoiceAt: number;
  sawSpeech: boolean;
  paused: boolean;
  /**
   * Per-recording override of the trimSilence setting: set when pause/resume can't be
   * trusted for THIS recording (suspended AudioContext, or WebKit's flaky pause/resume
   * on audio/mp4) without mutating the caller's preference.
   */
  trimDisabled: boolean;
  /** Set once the recording has been handed off, so a late frame can't stop it twice. */
  finished: boolean;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function useRecorder(
  onStop?: (blob: Blob, mimeType: string) => void,
  micDeniedMessage = 'Microphone permission was denied or unavailable.',
  options: {
    /** Auto-stop the turn after ~1.5s of silence. Per-user setting; ON in /live, OFF in /lesson. */
    handsFree?: boolean;
    /** Excise silence from the recording as it happens. Independent of handsFree. */
    trimSilence?: boolean;
  } = {},
) {
  const { handsFree = false, trimSilence = true } = options;

  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [level, setLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  /** ms left before the hands-free auto-stop fires; null when no countdown is running. */
  const [silenceCountdownMs, setSilenceCountdownMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endpointRef = useRef<EndpointState | null>(null);
  /** True from start() until the mic is open (or failed) - blocks re-entrant starts. */
  const startingRef = useRef(false);
  /** Set on unmount so a getUserMedia that resolves late releases its stream. */
  const disposedRef = useRef(false);
  /** Set when a turn is abandoned rather than finished: onstop must not deliver a blob. */
  const abortedRef = useRef(false);
  // Read inside the animation frame, so toggling the setting mid-session can't leave a
  // stale value baked into the closure.
  const handsFreeRef = useRef(handsFree);
  const trimSilenceRef = useRef(trimSilence);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    trimSilenceRef.current = trimSilence;
  }, [trimSilence]);

  const onStopRef = useRef(onStop);
  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  const cleanupAudioGraph = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    endpointRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  /**
   * Manual stop always wins (PLAN.md §8 Phase 7B item 2): it runs the same path the
   * auto-stop does, and the `finished` flag means whichever gets there first is the
   * only one that counts.
   */
  const stop = useCallback(() => {
    clearTimer();
    setSilenceCountdownMs(null);
    const endpoint = endpointRef.current;
    if (endpoint) endpoint.finished = true;

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop(); // fires onstop -> hands the blob to the caller
      return;
    }

    // Stopped while still listening for speech onset: nothing was ever written, so
    // there is no blob to hand back. Tear down and return to idle rather than
    // sending an empty recording to be transcribed.
    cleanupAudioGraph();
    stopStream();
    setStatus((prev) => (prev === 'recording' || prev === 'listening' ? 'idle' : prev));
  }, [clearTimer, cleanupAudioGraph, stopStream]);

  /**
   * End the turn WITHOUT handing anything back - the hands-free "nobody is there"
   * path. Distinct from stop(), which always delivers what it captured.
   */
  const abort = useCallback(() => {
    clearTimer();
    setSilenceCountdownMs(null);
    abortedRef.current = true;
    const endpoint = endpointRef.current;
    if (endpoint) endpoint.finished = true;

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop(); // onstop sees abortedRef and discards the blob
      return;
    }
    cleanupAudioGraph();
    stopStream();
    setStatus('idle');
  }, [clearTimer, cleanupAudioGraph, stopStream]);

  // The tick loop lives inside start()'s closure, so it reaches abort through a ref
  // rather than a dependency - same reason `stop` is called directly there.
  const abortRef = useRef(abort);
  useEffect(() => {
    abortRef.current = abort;
  }, [abort]);

  const start = useCallback(async () => {
    // Re-entrancy guard: a double-tap or the hands-free auto-start racing a manual tap
    // would otherwise overwrite streamRef/mediaRecorderRef and leak the first mic
    // stream (indicator stuck on) and its rAF loop.
    if (startingRef.current || streamRef.current) return;
    startingRef.current = true;
    abortedRef.current = false;
    setError(null);
    setElapsedSeconds(0);
    setSilenceCountdownMs(null);
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposedRef.current) {
        // Unmounted while the permission prompt was up: the cleanup below already ran
        // with nothing to tear down, so release the mic here or it stays hot.
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      // No forced mimeType (PLAN.md §4.1) - report the browser's actual choice
      // (audio/webm on Chrome/Android, audio/mp4 on iOS Safari) so the server never
      // has to guess.
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const recordedBlob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setSilenceCountdownMs(null);
        cleanupAudioGraph();
        stopStream();
        // Abandoned turn (nobody spoke): drop the bytes on the floor. Handing them to
        // the caller would cost a graded turn for a recording of an empty room.
        if (abortedRef.current) {
          setStatus('idle');
          return;
        }
        setStatus('stopped');
        onStopRef.current?.(recordedBlob, recorder.mimeType);
      };

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      // Created outside the tap gesture (see AUDIO_GRAPH_GRACE_MS): iOS Safari starts
      // it suspended. resume() usually works because a gesture happened recently, but
      // is not guaranteed - the tick loop below has the fallback for when it isn't.
      if (audioContext.state !== 'running') {
        void audioContext.resume().catch(() => {});
      }
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const endpoint: EndpointState = {
        phase: 'calibrating',
        openedAt: performance.now(),
        floorSamples: [],
        threshold: MIN_SPEECH_THRESHOLD,
        lastVoiceAt: 0,
        sawSpeech: false,
        paused: false,
        trimDisabled: false,
        finished: false,
      };
      endpointRef.current = endpoint;

      // The recording starts here, not when the mic opened - so whatever silence the
      // learner needed before speaking is simply never captured (leading trim).
      const beginCapture = (now: number, withSpeech: boolean) => {
        endpoint.phase = 'capturing';
        endpoint.lastVoiceAt = now;
        endpoint.sawSpeech = withSpeech;
        recorder.start();
        // WebKit's pause()/resume() on audio/mp4 has a history of corrupt fragments
        // across the pause boundary - and the target devices include a real iPhone.
        // An uncut recording always survives; a trimmed one sometimes doesn't.
        if (recorder.mimeType.includes('mp4')) endpoint.trimDisabled = true;
        setStatus('recording');
        // Wall-clock, deliberately: the 90s cap bounds how long the mic can be open,
        // and it has to hold even when a backgrounded tab starves requestAnimationFrame.
        timerRef.current = setInterval(() => {
          setElapsedSeconds((prev) => {
            const next = prev + 1;
            if (next >= MAX_RECORDING_SECONDS) stop();
            return next;
          });
        }, 1000);
      };

      const pauseCapture = () => {
        if (endpoint.paused || recorder.state !== 'recording') return;
        try {
          recorder.pause();
          endpoint.paused = true;
        } catch {
          // Browser without pause/resume: keep recording the silence rather than
          // losing the turn. Trimming is an optimization, never a correctness rule.
          trimSilenceRef.current = false;
        }
      };

      const resumeCapture = () => {
        if (!endpoint.paused) return;
        try {
          recorder.resume();
        } catch {
          trimSilenceRef.current = false;
        }
        endpoint.paused = false;
      };

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        if (endpoint.finished) return;

        const now = performance.now();

        // Suspended context = the analyser reads zeros (see AUDIO_GRAPH_GRACE_MS).
        // Once the grace runs out, fall back to plain record-on-tap: capture now, no
        // trimming, and no auto-stop until real speech is actually measured. If the
        // context comes alive later the loop below resumes with the conservative
        // MIN_SPEECH_THRESHOLD (calibration never ran).
        if (audioContext.state !== 'running') {
          if (endpoint.phase !== 'capturing' && now - endpoint.openedAt >= AUDIO_GRAPH_GRACE_MS) {
            endpoint.trimDisabled = true;
            beginCapture(now, false);
          }
          return;
        }

        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length / 255;
        setLevel(avg);

        if (endpoint.phase === 'calibrating') {
          endpoint.floorSamples.push(avg);
          if (now - endpoint.openedAt >= NOISE_FLOOR_CALIBRATION_MS) {
            const floor = median(endpoint.floorSamples);
            endpoint.threshold = Math.max(
              floor * NOISE_FLOOR_MULTIPLIER,
              floor + NOISE_FLOOR_MARGIN,
              MIN_SPEECH_THRESHOLD,
            );
            endpoint.phase = 'waiting';
          }
          return;
        }

        const isVoice = avg >= endpoint.threshold;

        if (endpoint.phase === 'waiting') {
          if (isVoice) {
            beginCapture(now, true);
          } else if (handsFreeRef.current) {
            // Hands-free opened this mic on the learner's behalf, so silence means
            // "not here" rather than "still thinking": close it and send nothing.
            if (now - endpoint.openedAt >= NO_SPEECH_TIMEOUT_MS) abortRef.current();
          } else if (now - endpoint.openedAt >= SPEECH_ONSET_GRACE_MS) {
            // Tap-to-record: the learner deliberately opened the mic, so record anyway
            // (and, having never heard speech, don't let the auto-stop end a turn that
            // hasn't started).
            beginCapture(now, false);
          }
          return;
        }

        if (isVoice) {
          endpoint.lastVoiceAt = now;
          endpoint.sawSpeech = true;
          if (endpoint.paused) resumeCapture();
          setSilenceCountdownMs((prev) => (prev === null ? prev : null));
          return;
        }

        const silentFor = now - endpoint.lastVoiceAt;

        // Capturing but still never having heard speech - only the suspended-context
        // fallback gets here. Same rule: hands-free doesn't sit recording an empty room.
        if (handsFreeRef.current && !endpoint.sawSpeech && silentFor >= NO_SPEECH_TIMEOUT_MS) {
          abortRef.current();
          return;
        }

        if (trimSilenceRef.current && !endpoint.trimDisabled && silentFor >= SILENCE_PAUSE_MS) {
          pauseCapture();
        }

        if (!handsFreeRef.current || !endpoint.sawSpeech) return;

        const remaining = Math.max(0, SILENCE_STOP_MS - silentFor);
        // Throttled to tenths so a 60fps loop isn't re-rendering the countdown 60x/s.
        setSilenceCountdownMs((prev) =>
          prev !== null && Math.ceil(prev / 100) === Math.ceil(remaining / 100) ? prev : remaining,
        );
        if (remaining === 0) {
          endpoint.finished = true;
          stop();
        }
      };

      setStatus('listening');
      tick();
    } catch {
      setStatus('error');
      setError(micDeniedMessage);
    } finally {
      startingRef.current = false;
    }
  }, [cleanupAudioGraph, stop, stopStream, micDeniedMessage]);

  const reset = useCallback(() => {
    setStatus('idle');
    setElapsedSeconds(0);
    setLevel(0);
    setSilenceCountdownMs(null);
    setError(null);
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      stop();
      cleanupAudioGraph();
      stopStream();
    };
  }, [stop, cleanupAudioGraph, stopStream]);

  return {
    status,
    level,
    elapsedSeconds,
    silenceCountdownMs,
    error,
    start,
    stop,
    reset,
    maxSeconds: MAX_RECORDING_SECONDS,
  };
}
