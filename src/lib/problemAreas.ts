import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { errorPatterns, reviewItems } from '@/lib/db/schema';
import { SRS } from '@/lib/srs';

/**
 * "Your problem areas" (ROADMAP.md P1.5b follow-on item 5): a drill assembled from
 * what the learner has already got wrong.
 *
 * Everything here is PICKED, never written. PLAN.md §0 forbids the app producing
 * lesson content at request time, and the material it needs already exists: every
 * recurring mistake is enqueued as a review item (`kind: 'error_pattern'`) the moment
 * it is recorded, so the drill is a selection query over rows, not a generation step.
 *
 * What it cannot do is invent practice for a mistake nothing covers. Those are logged
 * as content gaps instead, so the next curriculum pack is written against real demand.
 */

/** One round, same size as an ordinary review round - this is a drill, not a marathon. */
export const PROBLEM_DRILL_MAX_CARDS = SRS.MAX_ITEMS_PER_ROUND;
/** How many recurring mistakes lead the page. More than this is a wall, not a plan. */
export const PROBLEM_PATTERNS_SHOWN = 5;

export type ProblemPattern = {
  id: string;
  patternKey: string;
  description: string;
  occurrenceCount: number;
  /** False when nothing stored practises this - i.e. this is a content gap. */
  hasMaterial: boolean;
};

export type ProblemCard = {
  id: string;
  kind: 'vocab' | 'error_pattern';
  front: string;
  back: string;
};

export type ProblemDrill = {
  patterns: ProblemPattern[];
  cards: ProblemCard[];
  /** `patternKey`s with no stored material - what the next content pack should cover. */
  gaps: string[];
};

type PatternRow = {
  id: string;
  patternKey: string;
  description: string;
  occurrenceCount: number;
};

type ItemRow = ProblemCard & { sourceRef: string; dueAt: Date };

/**
 * The selection itself, kept pure so the ordering rules can be tested without a
 * database: the learner's worst mistakes first, their due vocab after, capped.
 */
export function assembleProblemDrill(args: {
  patterns: PatternRow[];
  /** Review items of kind 'error_pattern', keyed back to a pattern by `sourceRef`. */
  patternItems: ItemRow[];
  /** Due vocab items, oldest due first - what fills a short drill out. */
  dueVocab: ProblemCard[];
  now?: Date;
  limit?: number;
}): ProblemDrill {
  const limit = args.limit ?? PROBLEM_DRILL_MAX_CARDS;
  const now = args.now ?? new Date();
  const byPattern = new Map(args.patternItems.map((item) => [item.sourceRef, item]));

  const patterns: ProblemPattern[] = args.patterns.map((p) => ({
    id: p.id,
    patternKey: p.patternKey,
    description: p.description,
    occurrenceCount: p.occurrenceCount,
    hasMaterial: byPattern.has(p.id),
  }));

  // Mistake cards in the order the patterns rank, and among those the ones already
  // due first: a card the SRS has surfaced is the one the learner is losing.
  const mistakeCards = patterns
    .flatMap((p) => {
      const item = byPattern.get(p.id);
      return item ? [item] : [];
    })
    .sort((a, b) => Number(a.dueAt > now) - Number(b.dueAt > now));

  const cards: ProblemCard[] = [];
  const seen = new Set<string>();
  for (const card of [...mistakeCards, ...args.dueVocab]) {
    if (cards.length >= limit) break;
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push({ id: card.id, kind: card.kind, front: card.front, back: card.back });
  }

  return {
    patterns,
    cards,
    gaps: patterns.filter((p) => !p.hasMaterial).map((p) => p.patternKey),
  };
}

/**
 * The drill for one learner. Reads three things - the worst patterns, the review items
 * that practise them, and the due vocab that fills the round out - and hands the
 * assembly to the pure function above.
 */
export async function buildProblemDrill(args: {
  userId: string;
  languagePairId: string;
  limit?: number;
}): Promise<ProblemDrill> {
  const patterns = await db
    .select({
      id: errorPatterns.id,
      patternKey: errorPatterns.patternKey,
      description: errorPatterns.description,
      occurrenceCount: errorPatterns.occurrenceCount,
    })
    .from(errorPatterns)
    .where(
      and(
        eq(errorPatterns.userId, args.userId),
        eq(errorPatterns.languagePairId, args.languagePairId),
      ),
    )
    .orderBy(desc(errorPatterns.occurrenceCount), desc(errorPatterns.lastSeenAt))
    .limit(PROBLEM_PATTERNS_SHOWN);

  if (patterns.length === 0) return { patterns: [], cards: [], gaps: [] };

  const now = new Date();
  const [patternItems, dueVocab] = await Promise.all([
    db
      .select({
        id: reviewItems.id,
        kind: reviewItems.kind,
        front: reviewItems.front,
        back: reviewItems.back,
        sourceRef: reviewItems.sourceRef,
        dueAt: reviewItems.dueAt,
      })
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.userId, args.userId),
          eq(reviewItems.languagePairId, args.languagePairId),
          eq(reviewItems.kind, 'error_pattern'),
          inArray(
            reviewItems.sourceRef,
            patterns.map((p) => p.id),
          ),
        ),
      ),
    db
      .select({
        id: reviewItems.id,
        kind: reviewItems.kind,
        front: reviewItems.front,
        back: reviewItems.back,
      })
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.userId, args.userId),
          eq(reviewItems.languagePairId, args.languagePairId),
          eq(reviewItems.kind, 'vocab'),
          lte(reviewItems.dueAt, now),
        ),
      )
      .orderBy(asc(reviewItems.dueAt))
      .limit(args.limit ?? PROBLEM_DRILL_MAX_CARDS),
  ]);

  return assembleProblemDrill({
    patterns,
    patternItems: patternItems as ItemRow[],
    dueVocab,
    now,
    limit: args.limit,
  });
}
