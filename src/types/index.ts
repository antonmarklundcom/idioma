import type { FeedbackResult } from '@/lib/zodSchemas';
import type { GamificationResult } from '@/lib/gamification';

export type { FeedbackResult as GeminiFeedback };

export type LessonAttemptResponse = FeedbackResult & {
  // The practice_sessions row this turn was filed under, so the client can close it
  // out on leave (PLAN.md §16 defect 1).
  sessionId: string;
  tutorAudioBase64: string | null;
  gamification: GamificationResult;
};
