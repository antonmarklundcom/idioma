import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usageLog } from '@/lib/db/schema';
import { estimateMonthlyUsd } from '@/lib/adminLearners';

// ROADMAP.md P2.11: the learner-facing half of #57's admin usage panel. Same
// `usage_log` rows, same `estimateMonthlyUsd` arithmetic as `adminLearners.ts` — so
// this card can never show a different dollar figure than the owner sees for the
// same person. Purpose is family cost-awareness, not billing (PLAN.md §14.4 wants a
// number nobody can be billed against being treated as real money).

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type LearnerCostSummary = {
  attemptsThisMonth: number;
  ttsCharsThisMonth: number;
  speakingSecondsThisMonth: number;
  estimatedMonthlyUsd: number;
};

export async function getLearnerCostSummary(
  userId: string,
  now = new Date(),
): Promise<LearnerCostSummary> {
  const monthStart = startOfUtcMonth(now);

  const rows = await db
    .select({
      kind: usageLog.kind,
      rows: sql<number>`count(*)`,
      total: sql<number>`sum(${usageLog.amount})`,
    })
    .from(usageLog)
    .where(and(eq(usageLog.userId, userId), gte(usageLog.createdAt, monthStart)))
    .groupBy(usageLog.kind);

  let attemptsThisMonth = 0;
  let ttsCharsThisMonth = 0;
  let speakingSecondsThisMonth = 0;
  for (const row of rows) {
    if (row.kind === 'lesson_attempt') attemptsThisMonth = Number(row.rows);
    if (row.kind === 'tts_chars') ttsCharsThisMonth = Number(row.total);
    if (row.kind === 'speaking_seconds') speakingSecondsThisMonth = Number(row.total);
  }

  return {
    attemptsThisMonth,
    ttsCharsThisMonth,
    speakingSecondsThisMonth,
    estimatedMonthlyUsd: estimateMonthlyUsd({
      attempts: attemptsThisMonth,
      ttsChars: ttsCharsThisMonth,
    }),
  };
}
