/// <reference lib="webworker" />
/**
 * Idioma service worker — PLAN.md §7.1 (what it must do) and §7.2 (what it must NOT do).
 *
 * Built by `@serwist/cli` from `serwist.config.mjs` (see `npm run build`). It is NOT
 * compiled by Next.js, so it must not import anything through the `@/*` path alias.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CACHING CONTRACT — the complete list of what this worker intercepts.
 *
 * A route that is absent from `runtimeCaching` is not intercepted at all: Serwist's
 * fetch listener finds no match, never calls `event.respondWith()`, and the browser
 * performs the request exactly as it would with no service worker installed. There is
 * deliberately NO default/catch-all handler here, so "absent" really does mean
 * "untouched" (serwist's `setDefaultHandler` docs: "Without a default handler,
 * unmatched requests will go against the network as if there were no service worker
 * present.").
 *
 *   /api/auth/**                    NOT INTERCEPTED. §7.2. No route matches it, and every
 *                                   matcher below excludes it explicitly. A cached or
 *                                   replayed auth response is the failure mode that has no
 *                                   error message, so the worker stays out of the way.
 *   /api/**  (GET)                  NetworkOnly. Reaches the network every time; the
 *                                   response is never written to any cache. §7.1's
 *                                   "network-first for all /api/**" degenerates to
 *                                   network-only precisely because §7.1 also forbids ever
 *                                   populating the cache — a network-first strategy whose
 *                                   cache is never written IS network-only.
 *   /api/**  (POST/PUT/PATCH/DELETE) NOT INTERCEPTED. §7.2 "do not cache POST requests".
 *                                   Not registering them is stronger than registering them
 *                                   as NetworkOnly, and it keeps the recorder's audio
 *                                   upload body streaming straight to the network.
 *   RSC payloads (same-origin,      NetworkOnly. Client-side <Link> navigations. Never
 *   `RSC: 1` header, non-/api)      cached — these carry server-rendered tutor feedback,
 *                                   streaks and error patterns. No offline fallback: an
 *                                   HTML fallback body would break the router, so the fetch
 *                                   fails and Next falls back to a full page load, which
 *                                   the navigation route below turns into the offline page.
 *   document navigations            NetworkOnly + PrecacheFallbackPlugin -> /offline.
 *   (same-origin, non-/api)         Online: always the live page. Offline: the precached
 *                                   offline page. Authenticated HTML is never stored, so
 *                                   the app can never show a stale dashboard or stale
 *                                   feedback as if it were current.
 *   precached assets                CacheFirst, via Serwist's precache route (registered
 *   (/_next/static/**, /icons/**,   ahead of everything above). Content-hashed build output
 *   /manifest.webmanifest,          plus static files from public/ — the app shell. The
 *   /offline)                       precache manifest is generated at build time and can
 *                                   never contain an /api/** URL.
 *   everything else                 NOT INTERCEPTED — cross-origin requests, WebSockets,
 *                                   media/blob URLs, /_next/image, getUserMedia. §7.2: do
 *                                   not add routes matching Live-mode traffic.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, PrecacheFallbackPlugin, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected by @serwist/cli at build time (`injectionPoint`, default "self.__SW_MANIFEST").
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** The offline fallback page. Precached explicitly — see serwist.config.mjs. */
const OFFLINE_URL = '/offline';

/** True for same-origin `/api/auth/**` — the paths this worker must never touch (§7.2). */
const isAuthRoute = (sameOrigin: boolean, pathname: string): boolean =>
  sameOrigin && pathname.startsWith('/api/auth/');

/** True for same-origin `/api/**` other than the auth routes. */
const isApiRoute = (sameOrigin: boolean, pathname: string): boolean =>
  sameOrigin && pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/');

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    // Do NOT set navigateFallback: that would register a NavigationRoute serving a
    // precached HTML shell for every navigation, which is exactly the "wrong in the
    // safe-looking direction" rule this file exists to avoid. Navigations are handled
    // explicitly below.
  },
  skipWaiting: true,
  clientsClaim: true,
  // Off on purpose: Serwist's strategies never read `event.preloadResponse`, so enabling
  // it would fire a second, discarded request for every navigation.
  navigationPreload: false,
  // NOT using `fallbacks: {...}`: that option appends the fallback plugin to *every*
  // runtimeCaching entry, including the API routes, where an HTML body must never be
  // handed back in place of a failed JSON request. The navigation route is registered
  // separately below with the fallback plugin attached to it alone.
  runtimeCaching: [
    // ── /api/** (GET) ───────────────────────────────────────────────────────────
    // Network only. No cacheName, no plugins: there is no cache for this route to
    // read from or write to, so no API response can ever be served from cache.
    // /api/auth/** is excluded here and has no route of its own, so it is not
    // intercepted at all.
    {
      matcher: ({ sameOrigin, url }) => isApiRoute(sameOrigin, url.pathname),
      method: 'GET',
      handler: new NetworkOnly(),
    },

    // ── RSC payloads for client-side navigations ────────────────────────────────
    // Same-origin, non-/api, sent by the Next.js router with `RSC: 1`. Never cached.
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin &&
        request.headers.get('RSC') === '1' &&
        !url.pathname.startsWith('/api/'),
      method: 'GET',
      handler: new NetworkOnly(),
    },
  ],
});

// ── Document navigations ──────────────────────────────────────────────────────
// Registered after construction because `PrecacheFallbackPlugin` needs the `Serwist`
// instance that owns the precache, which does not exist until the constructor returns.
// Ordering is unaffected: Serwist answers with the first matching route, and neither
// route above can match a navigation (they require an /api/ path or an `RSC: 1` header).
//
// Online: always the live page — no authenticated HTML is ever written to a cache, so
// the app can never render a stale dashboard or stale tutor feedback as if it were
// current. Offline: the precached offline page instead of the browser's error page.
//
// `/api/auth/**` is excluded here as well: the OAuth sign-in and callback URLs are
// document navigations too, and §7.2 says the worker must not intercept them at all.
serwist.registerCapture(
  ({ request, sameOrigin, url }) =>
    sameOrigin &&
    request.mode === 'navigate' &&
    !isAuthRoute(sameOrigin, url.pathname) &&
    !url.pathname.startsWith('/api/'),
  new NetworkOnly({
    plugins: [new PrecacheFallbackPlugin({ fallbackUrls: [OFFLINE_URL], serwist })],
  }),
  'GET',
);

serwist.addEventListeners();
