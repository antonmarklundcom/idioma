import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { lessonContent, type CefrLevel } from '@/lib/db/schema';
import { toPlayerExercises } from '@/lib/lessons';

/**
 * The spoken placement check (ROADMAP.md P1.5b follow-on item 4).
 *
 * Onboarding asks people to self-select A1/A2/B1, which is a question almost nobody
 * can answer about themselves - and getting it wrong costs weeks of lessons that are
 * either trivial or impossible. This assembles a short ladder of speaking tasks of
 * rising difficulty, runs them through the ordinary attempt pipeline, and reads the
 * mistake counts back as a SUGGESTION the learner confirms.
 *
 * The tasks are picked from lessons already in the database - PLAN.md §0 forbids the
 * app writing lesson content at request time, and picking beats writing here anyway:
 * a new language pair gets a placement check the moment it has lessons, with no
 * pair-specific code (§ language_pairs is the extensibility point).
 */

/** Ascending: the ladder walks these in order, and so does the suggestion. */
export const PLACEMENT_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

/** Fewer than this and the result would be a guess dressed up as a measurement. */
export const PLACEMENT_MIN_TASKS = 4;
/** Every task is a graded turn against the daily cap (§6.5) - and a test, not a lesson. */
export const PLACEMENT_MAX_TASKS = 6;
/** At most this many tasks from any one level, so the ladder keeps climbing. */
const TASKS_PER_LEVEL = 2;

export type PlacementTask = {
  level: CefrLevel;
  lessonId: string;
  /** Index into the lesson's own exercises - the server rebuilds the prompt from it. */
  exerciseIndex: number;
  prompt: string;
};

type LadderLesson = {
  id: string;
  level: CefrLevel;
  position: number;
  content: unknown;
};

/**
 * Two tasks per level where there is room: the first lesson of the level and one
 * two-thirds of the way through it, so difficulty rises inside a level as well as
 * between them. Only `speak_prompt` exercises qualify - a listening task measures
 * comprehension, and a gapped sentence can be passed by reading.
 */
export function selectPlacementTasks(lessons: LadderLesson[]): PlacementTask[] {
  const tasks: PlacementTask[] = [];

  for (const level of PLACEMENT_LEVELS) {
    const atLevel = lessons
      .filter((l) => l.level === level)
      .sort((a, b) => a.position - b.position);
    if (atLevel.length === 0) continue;

    const picks = [atLevel[0]];
    const later = atLevel[Math.floor((atLevel.length * 2) / 3)];
    if (later && later.id !== picks[0].id) picks.push(later);

    for (const lesson of picks.slice(0, TASKS_PER_LEVEL)) {
      if (tasks.length >= PLACEMENT_MAX_TASKS) return tasks;
      const exercise = toPlayerExercises(lesson.content).find((e) => e.kind === 'speak');
      if (!exercise) continue;
      tasks.push({
        level,
        lessonId: lesson.id,
        exerciseIndex: exercise.index,
        prompt: exercise.prompt,
      });
    }
  }

  return tasks;
}

/** The ladder for a pair, or an empty list when its content cannot support one. */
export async function buildPlacementLadder(languagePairId: string): Promise<PlacementTask[]> {
  const rows = await db
    .select({
      id: lessonContent.id,
      level: lessonContent.level,
      position: lessonContent.position,
      content: lessonContent.content,
    })
    .from(lessonContent)
    .where(and(eq(lessonContent.languagePairId, languagePairId)))
    .orderBy(asc(lessonContent.level), asc(lessonContent.position));

  const tasks = selectPlacementTasks(rows);
  return tasks.length >= PLACEMENT_MIN_TASKS ? tasks : [];
}

// --- Reading the answers ----------------------------------------------------------

/**
 * A major mistake is worth four minor ones. Pronunciation slips and a wrong tense are
 * not the same evidence about whether someone can hold this level.
 */
const SEVERITY_WEIGHT: Record<string, number> = { minor: 0.5, moderate: 1, major: 2 };

/** One minor slip still passes: this is a placement check, not an exam. */
export const PLACEMENT_PASS_SCORE = 1;

export type PlacementAnswer = {
  level: CefrLevel;
  severities: string[];
};

export function answerScore(severities: string[]): number {
  return severities.reduce((sum, s) => sum + (SEVERITY_WEIGHT[s] ?? 1), 0);
}

export function answerPassed(answer: PlacementAnswer): boolean {
  return answerScore(answer.severities) <= PLACEMENT_PASS_SCORE;
}

/**
 * The highest level the learner actually held. Never extrapolates upward: passing the
 * B1 task suggests B1, not B2 - the app has no evidence about a task nobody did.
 */
export function suggestLevelFrom(answers: PlacementAnswer[]): CefrLevel {
  let best: CefrLevel = 'A1';
  for (const answer of answers) {
    if (!answerPassed(answer)) continue;
    if (PLACEMENT_LEVELS.indexOf(answer.level) > PLACEMENT_LEVELS.indexOf(best)) {
      best = answer.level;
    }
  }
  return best;
}

/**
 * Stop after two failures in a row. The ladder only goes up, so a third task is
 * another graded turn spent confirming what the last two already said - and being
 * walked through three exercises you cannot do is a miserable way to start.
 */
export function shouldStopEarly(answers: PlacementAnswer[]): boolean {
  if (answers.length < 2) return false;
  return !answerPassed(answers[answers.length - 1]) && !answerPassed(answers[answers.length - 2]);
}
