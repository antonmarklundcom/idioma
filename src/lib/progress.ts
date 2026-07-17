import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { practiceSessions, utterances } from '@/lib/db/schema';
import { getRankedErrorPatterns, type RankedErrorPattern } from '@/lib/errorPatterns';

export type SessionSummary = {
  id: string;
  mode: string;
  startedAt: Date;
  endedAt: Date | null;
  utteranceCount: number;
};

export async function getRecentSessions(
  userId: string,
  languagePairId: string,
  limit = 10,
): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      id: practiceSessions.id,
      mode: practiceSessions.mode,
      startedAt: practiceSessions.startedAt,
      endedAt: practiceSessions.endedAt,
      utteranceCount: sql<number>`count(${utterances.id})`,
    })
    .from(practiceSessions)
    .leftJoin(utterances, eq(utterances.sessionId, practiceSessions.id))
    .where(
      and(eq(practiceSessions.userId, userId), eq(practiceSessions.languagePairId, languagePairId)),
    )
    .groupBy(practiceSessions.id)
    .orderBy(desc(practiceSessions.startedAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, utteranceCount: Number(row.utteranceCount) }));
}

export type DashboardData = {
  errorPatterns: RankedErrorPattern[];
  recentSessions: SessionSummary[];
};

// Shared by /api/progress and the /dashboard server component so both read the exact
// same query logic (PLAN.md §2).
export async function getDashboardData(userId: string, languagePairId: string): Promise<DashboardData> {
  const [errorPatterns, recentSessions] = await Promise.all([
    getRankedErrorPatterns(userId, languagePairId),
    getRecentSessions(userId, languagePairId),
  ]);
  return { errorPatterns, recentSessions };
}
