import { z } from 'zod';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  languagePairs,
  lessonContent,
  practiceSessions,
  utterances,
  type CefrLevel,
} from '@/lib/db/schema';
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
 * The lesson that follows this one in the path, for the completion screen's "next
 * lesson" hand-off. Ordering is the same level → position → title order the browser
 * lists them in, and completion is deliberately NOT considered: after finishing
 * lesson 7 the obvious offer is lesson 8, even if it was practised once before.
 * Null at the end of the curriculum, where the screen simply doesn't make the offer.
 */
export function nextLessonAfter(
  lessons: LessonSummary[],
  lessonId: string,
): LessonSummary | null {
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index === -1) return null;
  return lessons[index + 1] ?? null;
}

/**
 * The path's three visual states. A lesson is `next` when it is the pointer
 * `nextLessonInPath` returned, `later` when it comes after that pointer, and
 * `done` when it has been completed. "Later" is a dimming hint only - adults may
 * jump ahead, so nothing here locks a lesson (ROADMAP.md P0.1).
 */
export type LessonPathState = 'done' | 'next' | 'later';

/**
 * How WELL a lesson went, as opposed to where it sits in the path (ROADMAP.md P1.6).
 *
 * - `untouched` - never opened.
 * - `started`   - practised, never finished (the learner left mid-lesson).
 * - `completed` - finished at least once, with mistakes worth revisiting.
 * - `mastered`  - finished, and the last finished run was clean (see `masteryOf`).
 *
 * Derived at read time from `practice_sessions` + `utterances`; there is no column
 * for it and no migration behind it.
 */
export type MasteryState = 'untouched' | 'started' | 'completed' | 'mastered';

export type LessonMastery = {
  state: MasteryState;
  /**
   * Mistakes per spoken turn in the last finished run, serious ones counted double.
   * 0 for anything not completed. Only used to rank "which completed lesson went
   * worst", so its scale matters less than its ordering.
   */
  shakiness: number;
};

export type LessonPathEntry = LessonSummary & {
  state: LessonPathState;
  mastery: MasteryState;
};

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
  mastery?: Map<string, LessonMastery>,
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
    // Callers that don't ask for mastery (the dashboard's next-lesson card) still
    // get a coherent two-state answer out of the completed set they already have.
    const masteryState =
      mastery?.get(lesson.id)?.state ?? (state === 'done' ? 'completed' : 'untouched');
    group.lessons.push({ ...lesson, state, mastery: masteryState });
    group.total += 1;
    if (state === 'done') group.doneCount += 1;
  }

  return levels;
}

/**
 * Topics are owner-authored slugs ('asking-directions', 'basic-health') because
 * they are also filter keys in the URL. They were being rendered raw, which put
 * 42 hyphenated database identifiers on the screen where a learner expected
 * lessons - the single most confusing thing on the page. Sentence case, not Title
 * Case: "Banking and bills" reads like a topic, "Banking And Bills" reads like a
 * spreadsheet column.
 */
export function formatTopic(topic: string): string {
  const words = topic.replace(/[-_]+/g, ' ').trim();
  if (words.length === 0) return topic;
  return words.charAt(0).toUpperCase() + words.slice(1);
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

export type PlayerExerciseKind = 'speak' | 'listen' | 'fill_gap' | 'dialogue';

/**
 * What the browser is allowed to know about an exercise. Deliberately does NOT
 * carry `audioText`: a listen_prompt's text is played, never displayed (§3.4),
 * so it stays server-side and reaches the learner only as synthesized audio.
 * A fill_gap_speak's `answer` is withheld for the same reason - the learner is
 * meant to produce it, not read it - while its gapped `sentence` IS shown.
 */
export type PlayerExercise = {
  index: number;
  kind: PlayerExerciseKind;
  prompt: string;
  /** fill_gap only: the sentence with the blank in it, displayed to the learner. */
  sentence?: string;
  /** dialogue only: what the other person says immediately before this line. */
  contextLine?: string;
  /**
   * dialogue only: the line the learner is performing. Unlike a fill_gap's `answer`
   * this IS sent to the browser - the whole exchange was just played and read in the
   * listening half of the step, so hiding it afterwards would be theatre. The player
   * keeps it behind a peek toggle so it is a choice, not the default.
   */
  answer?: string;
};

const EXERCISE_KINDS: Record<string, PlayerExerciseKind> = {
  speak_prompt: 'speak',
  listen_prompt: 'listen',
  fill_gap_speak: 'fill_gap',
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
  return rawExercises(content).flatMap<PlayerExercise>((exercise, index) => {
    if (!exercise) return [];
    const kind = typeof exercise.type === 'string' ? EXERCISE_KINDS[exercise.type] : undefined;
    if (!kind) return [];
    const prompt = nonEmptyString(exercise.prompt);
    if (!prompt) return [];
    if (kind === 'listen' && !nonEmptyString(exercise.audioText)) return [];
    if (kind === 'fill_gap') {
      const sentence = nonEmptyString(exercise.sentence);
      if (!sentence) return [];
      return [{ index, kind, prompt, sentence }];
    }
    return [{ index, kind, prompt }];
  });
}

/**
 * The learner's own lines of the dialogue, as ordinary player steps. Modelling them
 * as exercises is what keeps the dialogue off a second grading path: the player walks
 * them with the same loop, and the attempt route assembles their context from the
 * lesson row the same way - just from `dialogueLineIndex` instead of `exerciseIndex`.
 */
export function toDialogueTurns(content: unknown): PlayerExercise[] {
  const dialogue = toPlayerDialogue(content);
  if (!dialogue) return [];
  return dialogue.lines
    .filter((line) => line.isLearner)
    .map((line) => ({
      index: line.index,
      kind: 'dialogue' as const,
      prompt: line.gloss ?? line.text,
      contextLine: dialogue.lines[line.index - 1]?.text,
      answer: line.text,
    }));
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

  if (kind === 'fill_gap') {
    const sentence = nonEmptyString(exercise.sentence);
    if (!sentence) return null;
    // The expected completion is optional content, and it stays here rather than
    // going to the browser: the learner has to produce the missing words, so the
    // grader may see them but the player may not (§3.4, same rule as audioText).
    const answer = nonEmptyString(exercise.answer);
    return (
      'Fill-the-gap speaking exercise. The learner saw this sentence with a blank ' +
      `in it: "${sentence}"\nTheir task: ${prompt}\n` +
      (answer ? `The sentence completed reads: "${answer}"\n` : '') +
      'Judge whether they spoke the WHOLE sentence with the blank correctly filled, ' +
      `as well as how they said it.${hintsLine(exercise)}`
    );
  }

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

/**
 * The text one vocab item synthesizes for the lesson's vocab step (ROADMAP.md P1.5).
 *
 * Server-side only, for the same reason `getListenAudioText` is: the audio route
 * takes an INDEX from the browser and looks the words up here, so TTS spend can
 * never be driven by client-supplied text (§2, §6.12). `term` is the target-language
 * side of the item - the side worth hearing; the gloss is the learner's own language.
 */
export function getVocabAudioText(content: unknown, index: number): string | null {
  const item = getLessonVocab(content)[index];
  return item ? item.term : null;
}

// ---------------------------------------------------------------------------
// The dialogue block (ROADMAP.md lesson-loop item 4)
//
// A lesson used to be a word list plus isolated prompts; the dialogue is the thing
// that connects them. It is read defensively here like everything else in the jsonb
// column, and a malformed one simply doesn't render - it must never take a lesson
// with it.
// ---------------------------------------------------------------------------

export type PlayerDialogueLine = {
  index: number;
  speaker: string;
  text: string;
  gloss?: string;
  /** True for the lines the learner performs in the second half of the step. */
  isLearner: boolean;
};

export type PlayerDialogue = {
  setup?: string;
  lines: PlayerDialogueLine[];
};

function rawDialogue(content: unknown): Record<string, unknown> | null {
  const dialogue = (content as { dialogue?: unknown } | null)?.dialogue;
  return typeof dialogue === 'object' && dialogue !== null
    ? (dialogue as Record<string, unknown>)
    : null;
}

/**
 * The dialogue as the browser sees it - INCLUDING the learner's own lines. Unlike a
 * listen_prompt there is nothing to withhold: the whole exchange is played and read
 * in the listening half of the step, so pretending to hide it in the performing half
 * would be theatre. The learner's cue is the gloss; the line itself sits behind a
 * peek toggle in the UI.
 */
export function toPlayerDialogue(content: unknown): PlayerDialogue | null {
  const dialogue = rawDialogue(content);
  if (!dialogue) return null;
  const learnerSpeaker = nonEmptyString(dialogue.learnerSpeaker);
  const rawLines = Array.isArray(dialogue.lines) ? dialogue.lines : [];
  if (!learnerSpeaker || rawLines.length < 2) return null;

  const lines: PlayerDialogueLine[] = [];
  for (const [index, raw] of rawLines.entries()) {
    if (typeof raw !== 'object' || raw === null) return null;
    const line = raw as Record<string, unknown>;
    const speaker = nonEmptyString(line.speaker);
    const text = nonEmptyString(line.text);
    if (!speaker || !text) return null;
    lines.push({
      index,
      speaker,
      text,
      gloss: nonEmptyString(line.gloss) ?? undefined,
      isLearner: speaker === learnerSpeaker,
    });
  }
  // A dialogue nobody performs is just a paragraph; the step needs at least one
  // line for the learner and one for the other voice.
  if (!lines.some((line) => line.isLearner) || lines.every((line) => line.isLearner)) return null;

  return { setup: nonEmptyString(dialogue.setup) ?? undefined, lines };
}

/** The text one dialogue line synthesizes. Server-side, like every other TTS input. */
export function getDialogueAudioText(content: unknown, index: number): string | null {
  return toPlayerDialogue(content)?.lines[index]?.text ?? null;
}

/**
 * The `promptContext` for a learner's dialogue line. Assembled on the server from the
 * lesson row - the browser sends an index - and it carries what the other person just
 * said, so the tutor grades the line IN ITS EXCHANGE rather than as a stray sentence.
 */
export function buildDialoguePromptContext(content: unknown, index: number): string | null {
  const dialogue = toPlayerDialogue(content);
  const line = dialogue?.lines[index];
  if (!dialogue || !line || !line.isLearner) return null;

  const previous = dialogue.lines[index - 1];
  return (
    'Dialogue practice. The learner is performing one side of a short exchange' +
    `${dialogue.setup ? ` (${dialogue.setup})` : ''}.\n` +
    (previous ? `The other person just said: "${previous.text}"\n` : '') +
    `The line the learner is meant to produce is: "${line.text}"` +
    `${line.gloss ? ` (meaning: ${line.gloss})` : ''}\n` +
    'Judge how close what they said is to that line in meaning and in form, and how ' +
    'they said it. A natural equivalent is fine; a different meaning is not.'
  );
}

/**
 * Splitting a lesson intro into the promise and the fine print (ROADMAP.md lesson-loop
 * item 5). The intros are good writing in the wrong place: a learner opening a lesson
 * wants to know what they will be able to DO, and the grammar trap matters later, when
 * they are about to fall into it. A lesson may carry an explicit `canDo`; where it
 * doesn't, the first sentence is that promise in practice.
 */
export function splitIntro(
  intro: string,
  canDo?: string,
): { lead: string; rest: string | null } {
  const text = (intro ?? '').trim();
  if (canDo?.trim()) return { lead: canDo.trim(), rest: text || null };
  if (!text) return { lead: '', rest: null };

  // Sentence end followed by whitespace. Abbreviations would split badly, but lesson
  // intros are plain prose - and the cost of a wrong split is a short lead line, not
  // a broken page.
  const match = text.match(/^.*?[.!?](?=\s)/u);
  if (!match) return { lead: text, rest: null };
  const lead = match[0].trim();
  const rest = text.slice(match[0].length).trim();
  return { lead, rest: rest.length > 0 ? rest : null };
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


// ---------------------------------------------------------------------------
// Mastery states (ROADMAP.md P1.6)
//
// "Completed" alone can't tell a learner who scraped through from one who nailed
// it, so the four states above are derived - at read time, from tables that
// already exist - out of one row per lesson-mode practice session.
// ---------------------------------------------------------------------------

/** One `practice_sessions` row plus how its spoken turns went. */
export type LessonSessionSummary = {
  lessonId: string;
  /** NULL while the session is open: practised but not finished. */
  endedAt: Date | null;
  utteranceCount: number;
  minorErrors: number;
  /** moderate + major, kept together: either one means the run was not clean. */
  seriousErrors: number;
};

/**
 * A finished run counts as mastered when it carried no moderate/major error and
 * averaged at most one minor error per spoken turn - the ROADMAP.md P1.6 bar. A
 * run with no spoken turns at all (finished without answering anything) can't
 * clear it: there is no evidence to clear it with.
 */
function masteryOf(run: LessonSessionSummary): { mastered: boolean; shakiness: number } {
  const turns = run.utteranceCount;
  const shakiness = turns > 0 ? (run.seriousErrors * 2 + run.minorErrors) / turns : 0;
  return {
    mastered: turns > 0 && run.seriousErrors === 0 && run.minorErrors <= turns,
    shakiness,
  };
}

/**
 * Folds every session of every lesson into one state per lesson. The judgement is
 * made on the LAST finished run, not the best or the average: the question a
 * learner is asking is "how am I doing NOW", and an old clean run doesn't answer
 * it. Sessions may arrive in any order.
 */
export function deriveLessonMastery(
  sessions: LessonSessionSummary[],
): Map<string, LessonMastery> {
  const lastFinished = new Map<string, LessonSessionSummary>();
  const touched = new Set<string>();

  for (const session of sessions) {
    touched.add(session.lessonId);
    if (!session.endedAt) continue;
    const previous = lastFinished.get(session.lessonId);
    if (!previous || !previous.endedAt || session.endedAt > previous.endedAt) {
      lastFinished.set(session.lessonId, session);
    }
  }

  const result = new Map<string, LessonMastery>();
  for (const lessonId of touched) {
    const run = lastFinished.get(lessonId);
    if (!run) {
      result.set(lessonId, { state: 'started', shakiness: 0 });
      continue;
    }
    const { mastered, shakiness } = masteryOf(run);
    result.set(lessonId, { state: mastered ? 'mastered' : 'completed', shakiness });
  }
  return result;
}

/**
 * The "redo your shakiest lesson" pick (ROADMAP.md P1.6): the completed-but-not-
 * mastered lesson whose last run went worst. Null when everything completed is
 * already mastered, or when nothing has been completed yet - the chip then simply
 * doesn't render. Ties break towards the EARLIER lesson in the path, because that
 * is where the shaky foundation is.
 */
export function shakiestLesson(
  lessons: LessonSummary[],
  mastery: Map<string, LessonMastery>,
): LessonSummary | null {
  let worst: { lesson: LessonSummary; shakiness: number } | null = null;
  for (const lesson of lessons) {
    const entry = mastery.get(lesson.id);
    if (!entry || entry.state !== 'completed') continue;
    if (!worst || entry.shakiness > worst.shakiness) {
      worst = { lesson, shakiness: entry.shakiness };
    }
  }
  return worst?.lesson ?? null;
}

/**
 * One row per lesson-mode practice session this user has run, with its spoken
 * turns and their errors already counted in the database - the alternative was
 * pulling every utterance of every session into Node to count severities.
 * Tutor turns are excluded: only what the LEARNER said is evidence of mastery.
 */
export async function getLessonSessionSummaries(userId: string): Promise<LessonSessionSummary[]> {
  const severityCount = (severities: string) => sql<number>`coalesce(sum((
      select count(*) from jsonb_array_elements(coalesce(${utterances.errors}, '[]'::jsonb)) as e
      where e->>'severity' in (${sql.raw(severities)})
    )), 0)`;

  const rows = await db
    .select({
      lessonId: practiceSessions.lessonId,
      endedAt: practiceSessions.endedAt,
      utteranceCount: sql<number>`count(${utterances.id})`,
      minorErrors: severityCount("'minor'"),
      seriousErrors: severityCount("'moderate', 'major'"),
    })
    .from(practiceSessions)
    .leftJoin(
      utterances,
      and(eq(utterances.sessionId, practiceSessions.id), eq(utterances.speaker, 'user')),
    )
    .where(
      and(
        eq(practiceSessions.userId, userId),
        eq(practiceSessions.mode, 'lesson'),
        isNotNull(practiceSessions.lessonId),
      ),
    )
    .groupBy(practiceSessions.id);

  // pg returns count()/sum() as strings for bigint/numeric; Number() here keeps the
  // arithmetic in masteryOf from silently becoming string concatenation.
  return rows.flatMap((row) =>
    row.lessonId
      ? [
          {
            lessonId: row.lessonId,
            endedAt: row.endedAt,
            utteranceCount: Number(row.utteranceCount),
            minorErrors: Number(row.minorErrors),
            seriousErrors: Number(row.seriousErrors),
          },
        ]
      : [],
  );
}

/** The mastery map for one user, straight from the database. */
export async function getLessonMastery(userId: string): Promise<Map<string, LessonMastery>> {
  return deriveLessonMastery(await getLessonSessionSummaries(userId));
}

/** Lessons finished at least once, read off a mastery map (no second query). */
export function completedFromMastery(mastery: Map<string, LessonMastery>): Set<string> {
  const done = new Set<string>();
  for (const [lessonId, entry] of mastery) {
    if (entry.state === 'completed' || entry.state === 'mastered') done.add(lessonId);
  }
  return done;
}
