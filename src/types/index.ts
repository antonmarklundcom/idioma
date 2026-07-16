import type { FeedbackResult } from '@/lib/zodSchemas';

export type { FeedbackResult as GeminiFeedback };

export type LessonAttemptResponse = FeedbackResult & {
  tutorAudioBase64: string | null;
  gamification: null; // wired up in Phase 4B (PLAN.md §12)
};
