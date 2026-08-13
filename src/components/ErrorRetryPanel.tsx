'use client';

import { useEffect, useState } from 'react';
import { normalizeLocale, t, type Locale } from '@/lib/i18n';

// PLAN.md §8 Phase 8: shared body for every route-segment error.tsx. Next.js error
// boundaries are client components with no request context, so locale is guessed
// from the browser rather than `users.nativeLang` - good enough for a "something
// went wrong, try again" screen, which is the one place in the app where a slightly
// wrong locale guess costs nothing.
export function ErrorRetryPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale] = useState<Locale>(() =>
    typeof navigator === 'undefined' ? 'en' : normalizeLocale(navigator.language),
  );

  useEffect(() => {
    console.error('[route error]', error);
  }, [error]);

  const strings = t(locale).errorBoundary;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-lg font-semibold text-slate-900 dark:text-white">{strings.title}</p>
      <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">{strings.body}</p>
      <button
        type="button"
        onClick={reset}
        className="min-h-11 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white"
      >
        {strings.retry}
      </button>
    </div>
  );
}
