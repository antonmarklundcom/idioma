import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { errorPatterns, type UtteranceError } from '@/lib/db/schema';

// PLAN.md §4.1 step ⑥ / §10.3: one row per (user, pair, patternKey); occurrences
// increment via upsert. Called once per error found in an utterance, so the same
// mistake recorded twice ends up as one row with occurrenceCount = 2, not two rows.
export async function recordErrorPatterns(args: {
  userId: string;
  languagePairId: string;
  errors: UtteranceError[];
}): Promise<void> {
  for (const error of args.errors) {
    await db
      .insert(errorPatterns)
      .values({
        userId: args.userId,
        languagePairId: args.languagePairId,
        category: error.category,
        patternKey: error.patternKey,
        description: error.explanation,
        exampleQuote: error.quote,
      })
      .onConflictDoUpdate({
        target: [errorPatterns.userId, errorPatterns.languagePairId, errorPatterns.patternKey],
        set: {
          occurrenceCount: sql`${errorPatterns.occurrenceCount} + 1`,
          lastSeenAt: sql`now()`,
          description: error.explanation,
          exampleQuote: error.quote,
        },
      });
  }
}
