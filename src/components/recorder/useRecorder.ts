'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// PLAN.md §4.1 / §6.3: 90s client-side cap keeps recordings well under Vercel's
// ~4.5MB request body limit.
export const MAX_RECORDING_SECONDS = 90;

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error';

export function useRecorder(onStop?: (blob: Blob, mimeType: string) => void) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [level, setLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onStopRef = useRef(onStop);
  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  const cleanupAudioGraph = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setElapsedSeconds(0);
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
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
        setLevel(avg / 255);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      recorder.start();
      setStatus('recording');

      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS) stop();
          return next;
        });
      }, 1000);
    } catch {
      setStatus('error');
      setError('Microphone permission was denied or unavailable.');
    }
  }, [cleanupAudioGraph, stop, stopStream]);

  const reset = useCallback(() => {
    setStatus('idle');
    setElapsedSeconds(0);
    setLevel(0);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      stop();
      cleanupAudioGraph();
      stopStream();
    };
  }, [stop, cleanupAudioGraph, stopStream]);

  return { status, level, elapsedSeconds, error, start, stop, reset, maxSeconds: MAX_RECORDING_SECONDS };
}
