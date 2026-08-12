import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reviewItems } from '@/lib/db/schema';

// Spaced repetition, PLAN.md §13. Two things live here: the SM-2-lite scheduler
// (§13.3, pure and side-effect-free so it can be reasoned about on its own) and
// the two enqueue paths that feed the queue (§13.2).

export type ReviewOutcome = 'again' | 'good' | 'easy';

export const REVIEW_OUTCOMES: readonly ReviewOutcome[] = ['again', 'good', 'easy'];

// Every scheduling number in one place (mirrors the §12.2 convention for XP).
// Ease factors are ×100 integers throughout - the column is an integer (§3.3), and
// keeping the math in the same unit avoids float drift creeping into due dates.
export const SRS = {
  /** ≤10 due items per round (§13.4). */
  MAX_ITEMS_PER_ROUND: 10,
  DEFAULT_EASE_X100: 250,
  /** `again` floors the ease here so a hard item can't spiral to a zero interval. */
  MIN_EASE_X100: 130,
  AGAIN_EASE_DELTA_X100: 20,
  EASY_EASE_DELTA_X100: 5,
  /** `easy` multiplies the ease by an extra 1.3. */
  EASY_MULTIPLIER_X100: 130,
  /** The one sub-day case in the whole scheme: a lapse comes back this round. */
  AGAIN_RELEARN_MINUTES: 10,
  MAX_INTERVAL_DAYS: 60,
  MIN_GOOD_INTERVAL_DAYS: 1,
  MIN_EASY_INTERVAL_DAYS: 2,
  /** Only used for the dashboard nudge's "≈ N minutes" copy, never for scheduling. */
  SECONDS_PER_ITEM: 25,
} as const;

/**
 * "5 reviews waiting — 2 minutes" (§8 Phase 5B). Copy only: a round is short by
 * design, and the point of the number is that the learner can see that before
 * tapping. Never below 1 minute.
 */
export function estimateReviewMinutes(itemCount: number): number {
  return Math.max(1, Math.round((itemCount * SRS.SECONDS_PER_ITEM) / 60));
}

export type SchedulableItem = {
  /** ×100 (250 = 2.50). */
  easeFactor: number;
  intervalDays: number;
  reps: number;
  lapses: number;
};

export type ScheduleUpdate = SchedulableItem & { dueAt: Date };

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/**
 * SM-2-lite (PLAN.md §13.3) — three grades, no sub-day scheduling except `again`.
 *
 * Pure: takes the item's current state, returns the next one. Nothing here reads
 * the clock on its own (`now` is injected) so the same input always produces the
 * same output.
 *
 * With the default ease of 2.50 and repeated `good`, intervals run
 * 1 → 3 → 8 → 20 → 50 → 60 (capped) days. `easy` from a fresh item gives 2 days.
 * `again` sends the item back in 10 minutes and knocks 0.20 off the ease.
 */
export function nextSchedule(
  item: SchedulableItem,
  outcome: ReviewOutcome,
  now: Date = new Date(),
): ScheduleUpdate {
  const reps = item.reps + 1;

  if (outcome === 'again') {
    return {
      easeFactor: Math.max(SRS.MIN_EASE_X100, item.easeFactor - SRS.AGAIN_EASE_DELTA_X100),
      intervalDays: 0,
      reps,
      lapses: item.lapses + 1,
      dueAt: new Date(now.getTime() + SRS.AGAIN_RELEARN_MINUTES * 60_000),
    };
  }

  if (outcome === 'good') {
    // max(1, …) is what moves a brand-new item (intervalDays 0) to tomorrow.
    const intervalDays = Math.min(
      SRS.MAX_INTERVAL_DAYS,
      Math.max(SRS.MIN_GOOD_INTERVAL_DAYS, Math.round((item.intervalDays * item.easeFactor) / 100)),
    );
    return {
      easeFactor: item.easeFactor,
      intervalDays,
      reps,
      lapses: item.lapses,
      dueAt: addDays(now, intervalDays),
    };
  }

  // `easy`: the interval grows using the ease the item had going in, and only then
  // is the ease raised - so the bump applies from the NEXT grade onwards.
  const intervalDays = Math.min(
    SRS.MAX_INTERVAL_DAYS,
    Math.max(
      SRS.MIN_EASY_INTERVAL_DAYS,
      Math.round((item.intervalDays * item.easeFactor * SRS.EASY_MULTIPLIER_X100) / 10_000),
    ),
  );
  return {
    easeFactor: item.easeFactor + SRS.EASY_EASE_DELTA_X100,
    intervalDays,
    reps,
    lapses: item.lapses,
    dueAt: addDays(now, intervalDays),
  };
}

// --- Card text ------------------------------------------------------------
// Both built from data already in the database - PLAN.md §13.2 is explicit that
// enqueueing must not cost an extra LLM call.

export function buildVocabFront(vocab: { gloss: string; note?: string }): string {
  return vocab.note ? `${vocab.gloss} (${vocab.note})` : vocab.gloss;
}

/**
 * An elicitation prompt for a recurring mistake (§13.2): the learner sees what they
 * said last time plus the explanation, and has to produce the corrected form, which
 * is the item's `back`. The correction itself is deliberately not part of the front.
 */
export function buildErrorPatternFront(args: {
  description: string;
  exampleQuote: string | null;
}): string {
  const quote = args.exampleQuote?.trim();
  return quote
    ? `You said: “${quote}”. Say it correctly. (${args.description})`
    : `Say a sentence that gets this right: ${args.description}`;
}

// --- Enqueue paths (§13.2) ------------------------------------------------

export type LessonVocabItem = { term: string; gloss: string; note?: string };

/**
 * Lesson completion enqueues every `content.vocab[]` entry as a due-now item.
 *
 * Idempotent by the (userId, kind, sourceRef) unique index: re-completing a lesson
 * inserts nothing and - importantly - leaves an already-scheduled word's due date
 * alone, so revisiting a lesson can't drag mature vocab back to due-now.
 *
 * Returns the number of items actually added.
 */
export async function enqueueLessonVocab(args: {
  userId: string;
  languagePairId: string;
  lessonContentId: string;
  vocab: LessonVocabItem[];
}): Promise<number> {
  if (args.vocab.length === 0) return 0;

  const rows = args.vocab.map((vocab, index) => ({
    userId: args.userId,
    languagePairId: args.languagePairId,
    kind: 'vocab' as const,
    sourceRef: `${args.lessonContentId}#${index}`,
    front: buildVocabFront(vocab),
    back: vocab.term,
  }));

  const inserted = await db
    .insert(reviewItems)
    .values(rows)
    .onConflictDoNothing({
      target: [reviewItems.userId, reviewItems.kind, reviewItems.sourceRef],
    })
    .returning({ id: reviewItems.id });

  return inserted.length;
}

/**
 * Called for every `error_patterns` upsert (§13.2). A recurrence makes the item due
 * NOW regardless of where it sat in the schedule - the learner just proved they
 * haven't got it - while ease/interval/reps/lapses are left as they are, per §13.2,
 * which reschedules only `dueAt`. The next grade then moves the item normally (and
 * an `again`, the likely grade right after a recurrence, resets the interval anyway).
 */
export async function enqueueErrorPatternItem(args: {
  userId: string;
  languagePairId: string;
  errorPatternId: string;
  description: string;
  exampleQuote: string | null;
  correction: string;
}): Promise<void> {
  const front = buildErrorPatternFront({
    description: args.description,
    exampleQuote: args.exampleQuote,
  });

  await db
    .insert(reviewItems)
    .values({
      userId: args.userId,
      languagePairId: args.languagePairId,
      kind: 'error_pattern',
      sourceRef: args.errorPatternId,
      front,
      back: args.correction,
    })
    .onConflictDoUpdate({
      target: [reviewItems.userId, reviewItems.kind, reviewItems.sourceRef],
      // front/back refresh from the latest occurrence, matching how error_patterns
      // itself keeps the most recent description/example.
      set: { front, back: args.correction, dueAt: sql`now()` },
    });
}

// --- Queue reads and grading ---------------------------------------------

export type DueReviewItem = {
  id: string;
  kind: 'vocab' | 'error_pattern';
  front: string;
  back: string;
  reps: number;
  lapses: number;
  intervalDays: number;
  dueAt: Date;
};

/** Due items for one round: `dueAt <= now`, oldest first, capped (§13.4, §2). */
export async function getDueReviewItems(args: {
  userId: string;
  languagePairId: string;
  now?: Date;
  limit?: number;
}): Promise<DueReviewItem[]> {
  return db
    .select({
      id: reviewItems.id,
      kind: reviewItems.kind,
      front: reviewItems.front,
      back: reviewItems.back,
      reps: reviewItems.reps,
      lapses: reviewItems.lapses,
      intervalDays: reviewItems.intervalDays,
      dueAt: reviewItems.dueAt,
    })
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.userId, args.userId),
        eq(reviewItems.languagePairId, args.languagePairId),
        lte(reviewItems.dueAt, args.now ?? new Date()),
      ),
    )
    .orderBy(asc(reviewItems.dueAt))
    .limit(args.limit ?? SRS.MAX_ITEMS_PER_ROUND);
}

/** Total due right now - the dashboard nudge's number, not capped at a round. */
export async function countDueReviewItems(userId: string, languagePairId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.userId, userId),
        eq(reviewItems.languagePairId, languagePairId),
        lte(reviewItems.dueAt, new Date()),
      ),
    );
  return Number(row?.count ?? 0);
}

export async function getReviewItemForUser(itemId: string, userId: string) {
  const [row] = await db
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.id, itemId), eq(reviewItems.userId, userId)));
  return row ?? null;
}

/**
 * Applies one grade. Returns null if the item doesn't exist or isn't the caller's -
 * both are "not found" from the caller's perspective, same as `getLessonForPair`.
 */
export async function gradeReviewItem(args: {
  userId: string;
  itemId: string;
  outcome: ReviewOutcome;
  now?: Date;
}): Promise<ScheduleUpdate | null> {
  const item = await getReviewItemForUser(args.itemId, args.userId);
  if (!item) return null;

  const next = nextSchedule(
    {
      easeFactor: item.easeFactor,
      intervalDays: item.intervalDays,
      reps: item.reps,
      lapses: item.lapses,
    },
    args.outcome,
    args.now,
  );

  await db
    .update(reviewItems)
    .set({
      easeFactor: next.easeFactor,
      intervalDays: next.intervalDays,
      reps: next.reps,
      lapses: next.lapses,
      dueAt: next.dueAt,
    })
    .where(and(eq(reviewItems.id, args.itemId), eq(reviewItems.userId, args.userId)));

  return next;
}
