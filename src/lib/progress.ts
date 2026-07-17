import { count, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { errorPatterns, practiceSessions, utterances } from '@/lib/db/schema';

// PLAN.md §4B "conquered" flag: a pattern untouched for 14+ days with 3+
// occurrences reads as mastered rather than still-a-problem.
const CONQUERED_MIN_OCCURRENCES = 3;
const CONQUERED_STALE_DAYS = 14;

export type ErrorPatternWithFlag = typeof errorPatterns.$inferSelect & { conquered: boolean };

export type SessionSummary = {
  id: string;
  mode: 'lesson' | 'live';
  startedAt: Date;
  endedAt: Date | null;
  utteranceCount: number;
};

export async function getProgressData(
  userId: string,
): Promise<{ errorPatterns: ErrorPatternWithFlag[]; sessions: SessionSummary[] }> {
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

  return { errorPatterns: patterns, sessions };
}
