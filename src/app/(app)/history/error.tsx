'use client';

import { ErrorRetryPanel } from '@/components/ErrorRetryPanel';

// Covers both the conversation list and a single transcript.
export default function HistoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRetryPanel error={error} reset={reset} />;
}
