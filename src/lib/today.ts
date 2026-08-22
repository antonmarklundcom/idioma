import { SRS } from '@/lib/srs';

// ROADMAP.md P0.4 — "the one obvious button". /today chains what already exists:
// a short review warm-up, the next lesson's exercises, and one free-speaking turn.
// This file is only the shape of that session: which steps there are and roughly
// how long it takes. Every step is run by the existing review/lesson machinery.

/** A warm-up, not a review round: the full queue still lives at /review. */
export const TODAY_REVIEW_CAP = 5;

/** Seconds a learner spends on one lesson exercise / the closing free turn. */
const SECONDS_PER_EXERCISE = 45;
const SECONDS_PER_SPEAKING_TURN = 60;

export type TodayStepKind = 'review' | 'lesson' | 'speak';

export type TodaySessionShape = {
  dueCount: number;
  exerciseCount: number;
};

/**
 * The steps this learner's session actually has, in order. A step that has no
 * content is dropped rather than shown empty - a user with nothing due should
 * not be walked through an empty review round. Speaking always survives: it
 * needs no curriculum, which is what makes it the reliable last step.
 */
export function buildTodaySteps({ dueCount, exerciseCount }: TodaySessionShape): TodayStepKind[] {
  const steps: TodayStepKind[] = [];
  if (dueCount > 0) steps.push('review');
  if (exerciseCount > 0) steps.push('lesson');
  steps.push('speak');
  return steps;
}

/**
 * The "~7 min" on the dashboard button. Rounded to whole minutes and never zero:
 * this is a promise about how short the session is, so it is allowed to be rough
 * but not encouraging in a way the session can't honour.
 */
export function estimateTodayMinutes({ dueCount, exerciseCount }: TodaySessionShape): number {
  const seconds =
    dueCount * SRS.SECONDS_PER_ITEM +
    exerciseCount * SECONDS_PER_EXERCISE +
    SECONDS_PER_SPEAKING_TURN;
  return Math.max(1, Math.round(seconds / 60));
}
