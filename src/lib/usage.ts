import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usageLog } from '@/lib/db/schema';

// PLAN.md §6.5: early-warning cap against free-tier abuse / runaway retry loops,
// not a hard product limit - "e.g. 100" lesson attempts/user/day.
const DAILY_LESSON_ATTEMPT_CAP = 100;

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function isUnderDailyLessonAttemptCap(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(usageLog)
    .where(
      and(
        eq(usageLog.userId, userId),
        eq(usageLog.kind, 'lesson_attempt'),
        gte(usageLog.createdAt, startOfUtcDay()),
      ),
    );
  return Number(row?.count ?? 0) < DAILY_LESSON_ATTEMPT_CAP;
}

export async function logUsage(userId: string, kind: string, amount = 1): Promise<void> {
  await db.insert(usageLog).values({ userId, kind, amount });
}
