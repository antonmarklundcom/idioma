'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * PLAN.md §16 defect 1: tells the server when the learner leaves a practice surface,
 * so `practice_sessions.endedAt` gets set instead of every turn collapsing into one
 * endless session.
 *
 * `beforeunload` is deliberately NOT used: it is unreliable on mobile, which is the
 * only platform this app targets. `pagehide` fires on real navigations AND when iOS
 * freezes a tab into the back/forward cache, which is how phones actually leave a page.
 *
 * `sendBeacon` because a plain fetch is cancelled the moment the document goes away.
 * The whole mechanism is best-effort - the server's idle sweep (lib/sessions.ts) is
 * what actually guarantees sessions close.
 */
export function useSessionCloseOut(sessionId: string | null) {
  // Held in a ref so the pagehide listener is registered once and still sees the
  // latest session, rather than re-subscribing on every turn. Synced in an effect,
  // not during render - a render can be thrown away, and a discarded render must not
  // leave this pointing at a session that was never actually started.
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const sentForRef = useRef<string | null>(null);

  const endSession = useCallback(() => {
    const id = sessionIdRef.current;
    if (!id || sentForRef.current === id) return;
    sentForRef.current = id;
    // Beacons are fire-and-forget: no response to read, and no error to handle.
    navigator.sendBeacon?.('/api/session/end', JSON.stringify({ sessionId: id }));
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', endSession);
    return () => {
      window.removeEventListener('pagehide', endSession);
      // Unmount covers in-app navigation, where pagehide never fires.
      endSession();
    };
  }, [endSession]);
}
