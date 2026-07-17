import type { FeedbackResult } from '@/lib/zodSchemas';
import type { GamificationResult } from '@/lib/gamification';

export type { FeedbackResult as GeminiFeedback };

export type LessonAttemptResponse = FeedbackResult & {
  tutorAudioBase64: string | null;
  gamification: GamificationResult;
};
