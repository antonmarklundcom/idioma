import { count, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { errorPatterns, practiceSessions, utterances, type PracticeMode } from '@/lib/db/schema';
import { countDueReviewItems } from '@/lib/srs';

// PLAN.md §4B "conquered" flag: a pattern untouched for 14+ days with 3+
// occurrences reads as mastered rather than still-a-problem.
const CONQUERED_MIN_OCCURRENCES = 3;
const CONQUERED_STALE_DAYS = 14;

export type ErrorPatternWithFlag = typeof errorPatterns.$inferSelect & { conquered: boolean };

export type SessionSummary = {
  id: string;
  mode: PracticeMode;
  startedAt: Date;
  endedAt: Date | null;
  utteranceCount: number;
};

export type ProgressData = {
  errorPatterns: ErrorPatternWithFlag[];
  sessions: SessionSummary[];
  /** Due review items (PLAN.md §2 /api/progress); 0 when the user has no pair yet. */
  dueReviewCount: number;
};

export async function getProgressData(
  userId: string,
  languagePairId?: string | null,
): Promise<ProgressData> {
  const patternRows = await db
    .select()
    .from(errorPatterns)
    .where(eq(errorPatterns.userId, userId))
    .orderBy(desc(errorPatterns.occurrenceCount), desc(errorPatterns.lastSeenAt));

  const staleCutoff = Date.now() - CONQUERED_STALE_DAYS * 24 * 60 * 60 * 1000;
  const patterns = patternRows.map((p) => ({
    ...p,
    conquered:
      p.occurrenceCount >= CONQUERED_MIN_OCCURRENCES && p.lastSeenAt.getTime() < staleCutoff,
  }));

  const sessions = await db
    .select({
      id: practiceSessions.id,
      mode: practiceSessions.mode,
      startedAt: practiceSessions.startedAt,
      endedAt: practiceSessions.endedAt,
      utteranceCount: count(utterances.id),
    })
    .from(practiceSessions)
    .leftJoin(utterances, eq(utterances.sessionId, practiceSessions.id))
    .where(eq(practiceSessions.userId, userId))
    .groupBy(practiceSessions.id)
    .orderBy(desc(practiceSessions.startedAt))
    .limit(20);

  const dueReviewCount = languagePairId
    ? await countDueReviewItems(userId, languagePairId)
    : 0;

  return { errorPatterns: patterns, sessions, dueReviewCount };
}
