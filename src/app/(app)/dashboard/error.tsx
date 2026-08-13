'use client';

import { ErrorRetryPanel } from '@/components/ErrorRetryPanel';

// PLAN.md §8 Phase 8: catches the dashboard, including the weekly recap's
// usage_log/utterances aggregation.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRetryPanel error={error} reset={reset} />;
}
