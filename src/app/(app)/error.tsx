'use client';

import { ErrorRetryPanel } from '@/components/ErrorRetryPanel';

// PLAN.md §8 Phase 8: fallback boundary for the rest of the authenticated app
// (onboarding, settings) - the segments below (lesson/live/review/dashboard) define
// their own error.tsx and take precedence over this one.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRetryPanel error={error} reset={reset} />;
}
