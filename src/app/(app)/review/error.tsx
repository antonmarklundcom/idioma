'use client';

import { ErrorRetryPanel } from '@/components/ErrorRetryPanel';

// PLAN.md §8 Phase 8: catches the spaced-repetition review queue.
export default function ReviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRetryPanel error={error} reset={reset} />;
}
