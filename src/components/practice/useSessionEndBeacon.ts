'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { PracticeMode } from '@/lib/db/schema';

/**
 * Tells the server the learner has left, so their `practice_sessions` row gets closed
 * (PLAN.md §16 defect 1).
 *
 * Fires on `pagehide` - tab close, navigation away, bfcache entry - which is the signal
 * that actually works on iOS Safari, where `beforeunload` does not; and on unmount, which
 * covers client-side navigation inside the app (that never fires `pagehide`).
 *
 * Deliberately NOT on `visibilitychange`. Backgrounding a tab for ten seconds to read a
 * message is not leaving, and closing on it would chop one practice session into five,
 * with nothing able to merge them back. If the OS silently kills a backgrounded tab, the
 * 30-minute idle sweep in `getOrCreateSession` closes the session instead - bounded, and
 * self-healing. Over-fragmentation has no such backstop, so the sweep owns that case.
 *
 * The beacon is only sent if a turn was actually recorded: a learner who opens /lesson
 * and leaves without speaking has no session to close, and React's dev-mode double-mount
 * has nothing to report either.
 */
export function useSessionEndBeacon(mode: PracticeMode, lessonId?: string) {
  const hasUnreportedTurn = useRef(false);

  const send = useCallback(() => {
    if (!hasUnreportedTurn.current) return;
    // `pagehide` can fire more than once per mount (bfcache); one close is enough, and
    // recording another turn re-arms it.
    hasUnreportedTurn.current = false;

    const url = '/api/session/end';
    const body = JSON.stringify({ mode, lessonId });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
    // `keepalive` for the same reason sendBeacon exists: the request must outlive the page.
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }, [mode, lessonId]);

  useEffect(() => {
    window.addEventListener('pagehide', send);
    return () => {
      window.removeEventListener('pagehide', send);
      send();
    };
  }, [send]);

  const markTurnRecorded = useCallback(() => {
    hasUnreportedTurn.current = true;
  }, []);

  return { markTurnRecorded };
}
