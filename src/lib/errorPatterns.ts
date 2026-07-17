import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { errorPatterns } from '@/lib/db/schema';
import type { UtteranceError } from '@/lib/db/schema';

// PLAN.md §3.3/§10.3: pattern_key is a controlled taxonomy per language pair, injected
// into the prompt and enforced by the response schema - this is what makes aggregation
// (vs. one row per free-text occurrence) possible at all.
export async function upsertErrorPattern(args: {
  userId: string;
  languagePairId: string;
  error: UtteranceError;
}): Promise<void> {
  const { userId, languagePairId, error } = args;
  const description = `${error.correction} (was: "${error.quote}") - ${error.explanation}`;

  await db
    .insert(errorPatterns)
    .values({
      userId,
      languagePairId,
      category: error.category,
      patternKey: error.patternKey,
      description,
      exampleQuote: error.quote,
    })
    .onConflictDoUpdate({
      target: [errorPatterns.userId, errorPatterns.languagePairId, errorPatterns.patternKey],
      set: {
        occurrenceCount: sql`${errorPatterns.occurrenceCount} + 1`,
        lastSeenAt: new Date(),
        description,
        exampleQuote: error.quote,
      },
    });
}

// PLAN.md §4.1 personalization loop: top ~5 recurring patterns feed the tutor prompt so
// it watches for the learner's known weaknesses.
export async function getTopErrorPatterns(userId: string, languagePairId: string, limit = 5) {
  return db
    .select({ category: errorPatterns.category, description: errorPatterns.description })
    .from(errorPatterns)
    .where(and(eq(errorPatterns.userId, userId), eq(errorPatterns.languagePairId, languagePairId)))
    .orderBy(desc(errorPatterns.occurrenceCount), desc(errorPatterns.lastSeenAt))
    .limit(limit);
}

// "Conquered" (PLAN.md §12.2): ≥3 occurrences and untouched for 14+ days - the highest-
// value dopamine hit in the app because it's proof of learning, not just activity.
const CONQUERED_MIN_OCCURRENCES = 3;
const CONQUERED_QUIET_DAYS = 14;

export type RankedErrorPattern = {
  id: string;
  category: string;
  patternKey: string;
  description: string;
  exampleQuote: string | null;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  conquered: boolean;
};

export async function getRankedErrorPatterns(
  userId: string,
  languagePairId: string,
): Promise<RankedErrorPattern[]> {
  const rows = await db
    .select()
    .from(errorPatterns)
    .where(and(eq(errorPatterns.userId, userId), eq(errorPatterns.languagePairId, languagePairId)))
    .orderBy(desc(errorPatterns.occurrenceCount), desc(errorPatterns.lastSeenAt));

  const quietCutoff = Date.now() - CONQUERED_QUIET_DAYS * 24 * 60 * 60 * 1000;

  return rows.map((row) => ({
    ...row,
    conquered:
      row.occurrenceCount >= CONQUERED_MIN_OCCURRENCES &&
      row.lastSeenAt.getTime() < quietCutoff,
  }));
}
