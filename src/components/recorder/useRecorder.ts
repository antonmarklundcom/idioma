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

  const start = useCallback(async () => {
    setError(null);
    setElapsedSeconds(0);
    setSilenceCountdownMs(null);
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        setStatus('stopped');
        setSilenceCountdownMs(null);
        cleanupAudioGraph();
        stopStream();
        onStopRef.current?.(recordedBlob, recorder.mimeType);
      };

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
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

        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length / 255;
        setLevel(avg);

        const now = performance.now();

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
          } else if (now - endpoint.openedAt >= SPEECH_ONSET_GRACE_MS) {
            // Nothing crossed the bar. Record anyway (and, having never heard speech,
            // don't let the auto-stop end a turn that hasn't started).
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

        if (trimSilenceRef.current && silentFor >= SILENCE_PAUSE_MS) pauseCapture();

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
    return () => {
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
