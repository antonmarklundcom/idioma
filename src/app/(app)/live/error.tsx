'use client';

import { ErrorRetryPanel } from '@/components/ErrorRetryPanel';

// PLAN.md §8 Phase 8: catches the turn-based live conversation loop.
export default function LiveError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRetryPanel error={error} reset={reset} />;
}
