'use client';

import { useCallback, useEffect, useRef } from 'react';

// iOS blocks audio.play() outside a user-gesture call chain (PLAN.md §4.5). unlock()
// must be called synchronously inside a tap handler (see UtteranceRecorder's
// onBeforeStart) to prime a single reusable Audio element; play() then works from
// anywhere, including after an async fetch response.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function useTutorAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // The Audio element outlives the component - without this, navigating away
  // mid-reply leaves the tutor talking over the next page, and a stale onended can
  // still fire the hands-free auto-start on an unmounted tree.
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.pause();
        audio.removeAttribute('src');
      }
    };
  }, []);

  const unlock = useCallback(() => {
    if (audioRef.current) return;
    const audio = new Audio(SILENT_WAV);
    audio.play().catch(() => {});
    audioRef.current = audio;
  }, []);

  /**
   * `onEnded` powers the hands-free loop (PLAN.md §8 Phase 7B item 2): the next turn's
   * mic opens when the tutor stops speaking, not while they are still talking. It also
   * fires when playback fails outright - a turn that produced no sound must still hand
   * the conversation back, or the loop stalls silently.
   */
  const play = useCallback((base64: string, onEnded?: () => void) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    audio.onended = onEnded ? () => onEnded() : null;
    audio.src = `data:audio/mpeg;base64,${base64}`;
    audio.play().catch(() => onEnded?.());
  }, []);

  return { unlock, play };
}
