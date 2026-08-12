/**
 * PLAN.md §7.1 — Serwist build configuration ("configurator mode").
 *
 * WHY THIS FILE EXISTS INSTEAD OF A `withSerwist()` WRAPPER IN next.config.ts:
 * the classic `@serwist/next` default export is a webpack plugin, and Next.js 16 builds
 * with Turbopack by default. Wrapping next.config.ts would silently emit no service
 * worker (or force the whole project onto `next build --webpack`). Configurator mode is
 * Serwist's Turbopack-compatible path: `next build` runs untouched, then `serwist build`
 * reads the finished `.next/` output and bundles `src/sw.ts` into `public/sw.js`.
 * `npm run build` runs both, in that order.
 *
 * The caching behaviour itself lives in `src/sw.ts`; this file only decides what goes
 * into the precache manifest.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { serwist } from '@serwist/next/config';

const cwd = process.cwd();

/**
 * The offline fallback page is precached by URL rather than by globbing the prerendered
 * HTML (`precachePrerendered`), because globbing would also sweep in any other
 * prerendered route — and an authenticated page that lands in the precache is served
 * cache-first forever, which is exactly the stale-data failure §7.2 is about.
 *
 * The revision is a hash of the page's own source, so shipping a new offline page
 * invalidates the precached copy and nothing else does.
 */
const offlineRevision = createHash('sha256')
  .update(readFileSync(path.join(cwd, 'src/app/offline/page.tsx')))
  .digest('hex')
  .slice(0, 16);

export default await serwist({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  globDirectory: cwd,
  // App shell only: content-hashed build output plus the static files in public/.
  // No API route can appear here — these are files on disk, not routes.
  globPatterns: [
    '.next/static/**/*.{js,css,ico,png,svg,webp,woff,woff2,webmanifest}',
    'public/icons/**/*.png',
    'public/manifest.webmanifest',
  ],
  globIgnores: [
    // The owner-supplied artwork source (§9 Q6) — large, and never requested at runtime.
    'public/icon-source.png',
    // Emitted by this very build; never precache the worker itself.
    'public/sw.js',
    'public/sw.js.map',
  ],
  precachePrerendered: false,
  additionalPrecacheEntries: [{ url: '/offline', revision: offlineRevision }],
  // The largest precached file is a JS chunk; keep a sane ceiling so a stray large
  // asset fails the build loudly instead of bloating every install.
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
});
