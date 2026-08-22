import type { Metadata } from 'next';

/**
 * PLAN.md §7.1 — the service worker's offline fallback.
 *
 * Precached by URL (`serwist.config.mjs`), so it must render without a session, without
 * the database and without any client-side JS. It is deliberately outside the `(app)`
 * route group — that layout calls `auth()` and would redirect — and it is excluded from
 * the proxy matcher in `src/proxy.ts` so the service worker's install-time fetch gets the
 * page itself rather than a redirect to `/`.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Offline · Idioma',
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-brand-50 to-surface-sunken px-6 text-center font-sans dark:from-brand-900/30 dark:to-surface-sunken">
      <span className="text-6xl" role="img" aria-label="Microphone">
        🎙️
      </span>
      <h1 className="max-w-sm text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
        Idioma needs a connection to hear you 🎙️
      </h1>
      <p className="max-w-sm text-base text-ink-muted">
        Sin conexión. Reconnect and your lesson picks up exactly where you left it —
        nothing was lost.
      </p>
      <a
        href="/dashboard"
        className="btn-primary"
      >
        Try again
      </a>
    </main>
  );
}
