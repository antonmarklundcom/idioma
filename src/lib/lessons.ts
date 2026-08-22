import { z } from 'zod';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { languagePairs, lessonContent, practiceSessions, type CefrLevel } from '@/lib/db/schema';
import { lessonVocabItemSchema } from '@/lib/zodSchemas';
import type { LessonVocabItem } from '@/lib/srs';

export type LessonSummary = {
  id: string;
  level: CefrLevel;
  topic: string;
  title: string;
  position: number;
};

// PLAN.md §2 /api/lessons: list lesson_content for the user's language pair,
// filtered by level/topic. Never lists across pairs - content is pair-specific.
export async function getLessonsForPair(
  languagePairId: string,
  filters: { level?: CefrLevel; topic?: string } = {},
): Promise<LessonSummary[]> {
  const conditions = [eq(lessonContent.languagePairId, languagePairId)];
  if (filters.level) conditions.push(eq(lessonContent.level, filters.level));
  if (filters.topic) conditions.push(eq(lessonContent.topic, filters.topic));

  return db
    .select({
      id: lessonContent.id,
      level: lessonContent.level,
      topic: lessonContent.topic,
      title: lessonContent.title,
      position: lessonContent.position,
    })
    .from(lessonContent)
    .where(and(...conditions))
    .orderBy(asc(lessonContent.level), asc(lessonContent.position), asc(lessonContent.title));
}

/**
 * Lessons this user has finished at least once. "Completed" = a lesson-mode
 * practice session with `ended_at` set, which only the completion route and the
 * leave/idle close paths write - close enough for ordering the learning path,
 * and it needs no new table. Powers the "Next up" pointer on /lesson and the
 * dashboard's continue card.
 */
export async function getCompletedLessonIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ lessonId: practiceSessions.lessonId })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.userId, userId),
        eq(practiceSessions.mode, 'lesson'),
        isNotNull(practiceSessions.lessonId),
        isNotNull(practiceSessions.endedAt),
      ),
    );
  return new Set(rows.flatMap((r) => (r.lessonId ? [r.lessonId] : [])));
}

/**
 * The learning path's "start here" pointer: the first lesson (in the same
 * level → position → title order the browser lists them in) the user hasn't
 * completed yet. Null when there are no lessons or everything is done.
 */
export function nextLessonInPath(
  lessons: LessonSummary[],
  completed: Set<string>,
): LessonSummary | null {
  return lessons.find((lesson) => !completed.has(lesson.id)) ?? null;
}

/**
 * The path's three visual states. A lesson is `next` when it is the pointer
 * `nextLessonInPath` returned, `later` when it comes after that pointer, and
 * `done` when it has been completed. "Later" is a dimming hint only - adults may
 * jump ahead, so nothing here locks a lesson (ROADMAP.md P0.1).
 */
export type LessonPathState = 'done' | 'next' | 'later';

export type LessonPathEntry = LessonSummary & { state: LessonPathState };

export type LessonPathLevel = {
  level: CefrLevel;
  lessons: LessonPathEntry[];
  doneCount: number;
  total: number;
};

/**
 * Groups the lessons the browser is about to render into level sections and
 * labels each one with its path state. `lessons` is whatever the current filter
 * left visible, so the per-level counts describe the visible set; `nextUpId`
 * comes from `nextLessonInPath` over the UNFILTERED list, so filtering never
 * moves the "Next up" pointer. Input order (level → position → title) is kept.
 */
export function buildLessonPath(
  lessons: LessonSummary[],
  completed: Set<string>,
  nextUpId: string | null,
): LessonPathLevel[] {
  const levels: LessonPathLevel[] = [];

  // Anything uncompleted that is not the pointer necessarily sits after it -
  // the pointer is the FIRST uncompleted lesson - so it dims as "later".
  for (const lesson of lessons) {
    const state: LessonPathState = completed.has(lesson.id)
      ? 'done'
      : lesson.id === nextUpId
        ? 'next'
        : 'later';
    let group = levels.at(-1);
    if (!group || group.level !== lesson.level) {
      group = { level: lesson.level, lessons: [], doneCount: 0, total: 0 };
      levels.push(group);
    }
    group.lessons.push({ ...lesson, state });
    group.total += 1;
    if (state === 'done') group.doneCount += 1;
  }

  return levels;
}

// Distinct topics for a pair, used to populate the browser's topic filter.
export async function getTopicsForPair(languagePairId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ topic: lessonContent.topic })
    .from(lessonContent)
    .where(eq(lessonContent.languagePairId, languagePairId));
  return rows.map((r) => r.topic).sort();
}

// Returns null (not a 500) if the lesson doesn't exist OR belongs to a
// different language pair - both are "not found" from the caller's perspective.
export async function getLessonForPair(lessonId: string, languagePairId: string) {
  const [row] = await db
    .select()
    .from(lessonContent)
    .where(and(eq(lessonContent.id, lessonId), eq(lessonContent.languagePairId, languagePairId)));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Reading `lesson_content.content` (PLAN.md §3.4)
//
// The column is owner-supplied jsonb. It is Zod-validated on import, but these
// helpers still read it defensively - and they are the ONLY place that decides
// what an exercise means, so the player, the attempt route and the audio route
// can't drift apart. Indices are always indices into the ORIGINAL `exercises`
// array: they round-trip from the browser back to this file as `exerciseIndex`.
// ---------------------------------------------------------------------------

export type PlayerExerciseKind = 'speak' | 'listen';

/**
 * What the browser is allowed to know about an exercise. Deliberately does NOT
 * carry `audioText`: a listen_prompt's text is played, never displayed (§3.4),
 * so it stays server-side and reaches the learner only as synthesized audio.
 */
export type PlayerExercise = {
  index: number;
  kind: PlayerExerciseKind;
  prompt: string;
};

const EXERCISE_KINDS: Record<string, PlayerExerciseKind> = {
  speak_prompt: 'speak',
  listen_prompt: 'listen',
};

type RawExercise = Record<string, unknown>;

function rawExercises(content: unknown): (RawExercise | null)[] {
  const exercises = (content as { exercises?: unknown } | null)?.exercises;
  if (!Array.isArray(exercises)) return [];
  return exercises.map((e) => (typeof e === 'object' && e !== null ? (e as RawExercise) : null));
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function hintsLine(exercise: RawExercise): string {
  const hints = exercise.targetHints;
  if (!Array.isArray(hints)) return '';
  const usable = hints.filter((h): h is string => typeof h === 'string' && h.trim().length > 0);
  return usable.length > 0 ? `\nFocus on: ${usable.join(', ')}.` : '';
}

/**
 * The exercises the player can actually run, in order. Unrecognized `type` values
 * are skipped rather than crashing the player (§3.4 forward compatibility), as is
 * anything missing the fields its type requires.
 */
export function toPlayerExercises(content: unknown): PlayerExercise[] {
  return rawExercises(content).flatMap((exercise, index) => {
    if (!exercise) return [];
    const kind = typeof exercise.type === 'string' ? EXERCISE_KINDS[exercise.type] : undefined;
    if (!kind) return [];
    const prompt = nonEmptyString(exercise.prompt);
    if (!prompt) return [];
    if (kind === 'listen' && !nonEmptyString(exercise.audioText)) return [];
    return [{ index, kind, prompt }];
  });
}

/**
 * The `promptContext` sent to /api/lesson/attempt for one exercise. Built here on
 * the server because a listen_prompt's context includes `audioText`, which the
 * browser must never see (§3.4).
 */
export function buildExercisePromptContext(content: unknown, index: number): string | null {
  const exercise = rawExercises(content)[index];
  if (!exercise) return null;
  const kind = typeof exercise.type === 'string' ? EXERCISE_KINDS[exercise.type] : undefined;
  const prompt = nonEmptyString(exercise.prompt);
  if (!kind || !prompt) return null;

  if (kind === 'listen') {
    const audioText = nonEmptyString(exercise.audioText);
    if (!audioText) return null;
    return (
      'Listening comprehension exercise. The learner heard this clip spoken aloud and ' +
      `never saw it written: "${audioText}"\nTheir task: ${prompt}\n` +
      'Judge whether their answer shows they understood the clip, as well as how they ' +
      `said it.${hintsLine(exercise)}`
    );
  }

  return `${prompt}${hintsLine(exercise)}`;
}

/** The text a listen_prompt exercise synthesizes. Server-side only - never returned to the browser. */
export function getListenAudioText(content: unknown, index: number): string | null {
  const exercise = rawExercises(content)[index];
  if (!exercise || exercise.type !== 'listen_prompt') return null;
  return nonEmptyString(exercise.audioText);
}

/** The lesson's vocab list, for the review-queue enqueue on completion (§13.2). */
export function getLessonVocab(content: unknown): LessonVocabItem[] {
  const raw = (content as { vocab?: unknown } | null)?.vocab;
  const parsed = z.array(lessonVocabItemSchema).safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}

export type AdminLessonSummary = LessonSummary & {
  languagePairCode: string;
  createdAt: Date;
};

// Every lesson across every pair, for the admin import panel (§2 /api/admin/content).
export async function getAllLessonsForAdmin(): Promise<AdminLessonSummary[]> {
  return db
    .select({
      id: lessonContent.id,
      languagePairCode: languagePairs.code,
      level: lessonContent.level,
      topic: lessonContent.topic,
      title: lessonContent.title,
      position: lessonContent.position,
      createdAt: lessonContent.createdAt,
    })
    .from(lessonContent)
    .innerJoin(languagePairs, eq(languagePairs.id, lessonContent.languagePairId))
    .orderBy(asc(languagePairs.code), asc(lessonContent.level), asc(lessonContent.position));
}
