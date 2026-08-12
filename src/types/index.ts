import type { FeedbackResult } from '@/lib/zodSchemas';
import type { GamificationResult } from '@/lib/gamification';
import type { ReviewItemKind } from '@/lib/db/schema';

export type { FeedbackResult as GeminiFeedback };

export type LessonAttemptResponse = FeedbackResult & {
  tutorAudioBase64: string | null;
  gamification: GamificationResult;
};

// POST /api/lessons/[lessonId]/complete (PLAN.md §13.2 vocab enqueue + §12.2 XP).
export type LessonCompleteResponse = {
  enqueuedCount: number;
  alreadyCompleted: boolean;
  dueReviewCount: number;
  gamification: { xpAwarded: number; xpTotal: number | null };
};

// What the /review UI needs about one due item. Deliberately narrower than the
// database row: scheduling state stays on the server (PLAN.md §13.3).
export type ReviewCard = {
  id: string;
  kind: ReviewItemKind;
  front: string;
  back: string;
};

export type ReviewGradeResponse = {
  dueAt: string;
  intervalDays: number;
  reps: number;
  lapses: number;
  gamification: { xpAwarded: number; xpTotal: number };
};
