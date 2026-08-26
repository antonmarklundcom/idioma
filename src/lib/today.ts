import { SRS } from '@/lib/srs';
import { getLessonVocab, toPlayerDialogue, toPlayerExercises } from '@/lib/lessons';

// ROADMAP.md P0.4 — "the one obvious button". /today chains what already exists:
// a short review warm-up, the next lesson, and one free-speaking turn. This file is
// only the shape of that session: which steps there are and roughly how long it
// takes. Every step is run by the existing review/lesson machinery.

/** A warm-up, not a review round: the full queue still lives at /review. */
export const TODAY_REVIEW_CAP = 5;

/** Seconds a learner spends on one lesson exercise / the closing free turn. */
const SECONDS_PER_EXERCISE = 45;
const SECONDS_PER_SPEAKING_TURN = 60;
/**
 * Presentation, not production, so both are a fraction of an exercise: reading a
 * word and tapping to hear it, and hearing one line of the conversation. Neither
 * costs a graded turn - which is exactly why they are affordable here (see
 * `todaySessionShape`).
 */
const SECONDS_PER_VOCAB_ITEM = 5;
const SECONDS_PER_DIALOGUE_LINE = 6;

export type TodayStepKind = 'review' | 'lesson' | 'speak';

export type TodaySessionShape = {
  dueCount: number;
  /** Words presented before the drills - free, and the drills assume them. */
  vocabCount: number;
  /** Lines of the conversation played as the model. NOT performed here. */
  dialogueLineCount: number;
  exerciseCount: number;
};

/**
 * What today's session is made of, from the two things that decide it: how much is
 * due, and the lesson the path serves next.
 *
 * One function because two callers need the same answer - /today builds the session
 * and /dashboard advertises its length on the button - and a button that promises
 * "~7 min" for a session assembled by different arithmetic is how that promise rots.
 *
 * `lessonContent` is the raw stored content (or null when the path has nothing left);
 * the accessors it goes through are the same ones the player reads it with, so a
 * lesson whose exercises the player would skip is not counted here either.
 */
export function todaySessionShape(
  dueCount: number,
  lessonContent: unknown | null,
): TodaySessionShape {
  if (lessonContent == null) {
    return { dueCount, vocabCount: 0, dialogueLineCount: 0, exerciseCount: 0 };
  }
  return {
    dueCount,
    vocabCount: getLessonVocab(lessonContent).length,
    dialogueLineCount: toPlayerDialogue(lessonContent)?.lines.length ?? 0,
    // Deliberately NOT `toDialogueTurns`: the dialogue's learner lines are graded
    // turns, and /today already spends its budget on the drills and the closing
    // turn. Here the conversation is the model; performing it is the lesson tab's job.
    exerciseCount: toPlayerExercises(lessonContent).length,
  };
}

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
export function estimateTodayMinutes(shape: TodaySessionShape): number {
  const { dueCount, vocabCount, dialogueLineCount, exerciseCount } = shape;
  // The words and the conversation are steps INSIDE the lesson step, and the player
  // only shows them when it has exercises to introduce. With no lesson step there is
  // no time to advertise for them.
  const lessonSeconds =
    exerciseCount > 0
      ? exerciseCount * SECONDS_PER_EXERCISE +
        vocabCount * SECONDS_PER_VOCAB_ITEM +
        dialogueLineCount * SECONDS_PER_DIALOGUE_LINE
      : 0;

  const seconds = dueCount * SRS.SECONDS_PER_ITEM + lessonSeconds + SECONDS_PER_SPEAKING_TURN;
  return Math.max(1, Math.round(seconds / 60));
}
