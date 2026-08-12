'use client';

import { useEffect } from 'react';

/**
 * PLAN.md §7.1 — registers the Serwist-built worker at `/sw.js`.
 *
 * Registration is done by hand rather than by `@serwist/next`'s auto-injected entry,
 * because this project builds the worker in configurator mode (see `serwist.config.mjs`),
 * where nothing is injected into the client bundle.
 *
 * Nothing here touches audio: the worker is registered on mount, never inside a user
 * gesture handler, so it cannot interfere with the `AudioContext`-inside-a-tap rule that
 * iOS enforces (§7.1) or with `getUserMedia`.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // In dev there is no `public/sw.js` (it is a build artifact), and registering a
    // stale one against a Turbopack dev server only causes confusion.
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error: unknown) => {
        // A failed registration must never break the app — it only means no offline page.
        console.error('[pwa] service worker registration failed:', error);
      });
  }, []);

  return null;
}
