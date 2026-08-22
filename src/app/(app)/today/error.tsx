'use client';

import { ErrorRetryPanel } from '@/components/ErrorRetryPanel';

// ROADMAP.md P0.4: /today reads the review queue, the lesson path and the user's
// stats in one go, so any of those failing lands here rather than on a blank page.
export default function TodayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRetryPanel error={error} reset={reset} />;
}
