'use client';

import { ErrorRetryPanel } from '@/components/ErrorRetryPanel';

// PLAN.md §8 Phase 8: catches the lesson browser, a lesson's exercise player, and
// free practice (all nested under this segment) - the three screens that drive the
// Gemini lesson-feedback pipeline.
export default function LessonError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRetryPanel error={error} reset={reset} />;
}
