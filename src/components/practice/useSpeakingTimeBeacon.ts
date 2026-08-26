'use client';

import { useCallback, useEffect, useRef } from 'react';
import { SPEAKING_SECONDS_MAX_PER_REPORT } from '@/lib/zodSchemas';

/**
 * Reports speaking time from practice that never becomes a graded turn - shadowing
 * (ROADMAP.md P1.5b follow-on item 3), which is ungraded on purpose and therefore
 * never touched the server at all.
 *
 * Accumulated rather than sent per repetition: a ten-word shadowing run is ten trips
 * for ten numbers that are only ever read as one sum, and `usage_log` is nicer to
 * query with one row per run than with twenty. The flush follows
 * `useSessionEndBeacon` exactly - `pagehide` for tab close, navigation away and
 * bfcache entry (the signal that actually works on iOS Safari, where `beforeunload`
 * does not), plus unmount for client-side navigation inside the app, which never
 * fires `pagehide`.
 *
 * Nothing is sent when nothing was spoken, so a learner who opens the vocabulary step
 * and leaves - or React's dev-mode double-mount - reports nothing.
 */
export function useSpeakingTimeBeacon() {
  const pendingSeconds = useRef(0);

  const send = useCallback(() => {
    // Rounded here rather than per repetition: five 2.4-second words are 12 seconds
    // of speaking, and rounding each one first loses two of them.
    const seconds = Math.min(SPEAKING_SECONDS_MAX_PER_REPORT, Math.round(pendingSeconds.current));
    if (seconds <= 0) return;
    // `pagehide` can fire more than once per mount (bfcache), and unmount follows it;
    // clearing first means the same seconds are never reported twice.
    pendingSeconds.current = 0;

    const url = '/api/speaking-time';
    const body = JSON.stringify({ seconds });
    // sendBeacon fails synchronously (queue full, payload too large) by returning
    // `false` rather than throwing - fall back to a keepalive fetch so the minutes
    // still land instead of being silently dropped.
    if (navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) {
      return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', send);
    return () => {
      window.removeEventListener('pagehide', send);
      send();
    };
  }, [send]);

  const addSpokenSeconds = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    pendingSeconds.current += seconds;
  }, []);

  /** Report now rather than on the way out - the end of a run the learner finished. */
  const flushSpeakingTime = useCallback(() => {
    send();
  }, [send]);

  return { addSpokenSeconds, flushSpeakingTime };
}
