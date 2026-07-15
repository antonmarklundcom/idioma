'use client';

import { useCallback, useRef } from 'react';

// iOS blocks audio.play() outside a user-gesture call chain (PLAN.md §4.5). unlock()
// must be called synchronously inside a tap handler (see UtteranceRecorder's
// onBeforeStart) to prime a single reusable Audio element; play() then works from
// anywhere, including after an async fetch response.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function useTutorAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const unlock = useCallback(() => {
    if (audioRef.current) return;
    const audio = new Audio(SILENT_WAV);
    audio.play().catch(() => {});
    audioRef.current = audio;
  }, []);

  const play = useCallback((base64: string) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    audioRef.current.src = `data:audio/mp3;base64,${base64}`;
    audioRef.current.play().catch(() => {});
  }, []);

  return { unlock, play };
}
