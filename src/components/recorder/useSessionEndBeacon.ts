'use client';

import { useEffect } from 'react';

/**
 * Closes the user's open practice sessions when they leave a practice page
 * (PLAN.md §16 defect 1).
 *
 * `pagehide`, not `beforeunload`: iOS Safari fires `beforeunload` unreliably or
 * not at all, and `pagehide` also covers the back/forward cache. `sendBeacon`,
 * not `fetch`: a normal request started during unload gets cancelled, while a
 * beacon is queued by the browser and delivered afterwards.
 *
 * Also fires on unmount, which is what actually catches client-side navigation
 * between /lesson and /live - no page unload happens there at all.
 *
 * Best-effort by design. The idle timeout in lib/practiceSessions.ts is the
 * backstop for every case where this never runs.
 */
export function useSessionEndBeacon() {
  useEffect(() => {
    const send = () => {
      // Empty Blob: the route reads no body, and this keeps the request from
      // carrying a Content-Type nobody needs to handle.
      navigator.sendBeacon?.('/api/session/end', new Blob());
    };

    window.addEventListener('pagehide', send);
    return () => {
      window.removeEventListener('pagehide', send);
      send();
    };
  }, []);
}
