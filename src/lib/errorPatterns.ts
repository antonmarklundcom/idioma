import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { errorPatterns, type UtteranceError } from '@/lib/db/schema';
import { enqueueErrorPatternItem } from '@/lib/srs';

// PLAN.md §4.1 step ⑥ / §10.3: one row per (user, pair, patternKey); occurrences
// increment via upsert. Called once per error found in an utterance, so the same
// mistake recorded twice ends up as one row with occurrenceCount = 2, not two rows.
//
// Phase 5B (§13.2): the same upsert also enqueues - or reactivates - the pattern's
// spaced-repetition item, so a mistake the learner keeps making comes back as a
// drill without any extra model call.
export async function recordErrorPatterns(args: {
  userId: string;
  languagePairId: string;
  errors: UtteranceError[];
}): Promise<void> {
  for (const error of args.errors) {
    const [pattern] = await db
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
      })
      .returning({ id: errorPatterns.id });

    if (!pattern) continue;

    try {
      await enqueueErrorPatternItem({
        userId: args.userId,
        languagePairId: args.languagePairId,
        errorPatternId: pattern.id,
        description: error.explanation,
        exampleQuote: error.quote,
        correction: error.correction,
      });
    } catch (err) {
      // The review queue is downstream of the core loop, never load-bearing for it:
      // a failure here (e.g. code deployed ahead of the Phase 5B migration) must not
      // cost the learner a turn they already recorded and paid model quota for. The
      // next occurrence of the same pattern enqueues it again.
      console.error('[errorPatterns] review enqueue failed', err);
    }
  }
}
