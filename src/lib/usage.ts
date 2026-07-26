import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usageLog } from '@/lib/db/schema';

// PLAN.md §6.5: early-warning caps against free-tier abuse / runaway retry loops,
// not hard product limits. The per-tier daily value lives in lib/tiers.ts (§15.3).

/**
 * Cloud TTS's free allotment is 1M Neural2 characters/month (§4.5), and it is
 * PROJECT-WIDE, not per user - so this sums every user's usage. Set to 80% of the
 * allotment: crossing it degrades to text-only feedback (an already-implemented,
 * already-non-fatal path) instead of billing project B, which has billing enabled
 * and therefore fails OPEN where Gemini's free tier would 429. This cap is the
 * only thing standing between the "$0/month, confirmed" constraint and a surprise
 * invoice (PLAN.md §16 defect 2).
 */
export const MONTHLY_TTS_CHAR_CAP = 800_000;

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Google's billing month isn't exactly the UTC month, but at a 20% safety margin
// the difference can't matter - this is an early warning, not an accountant.
function startOfUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function isUnderDailyLessonAttemptCap(
  userId: string,
  cap: number,
): Promise<boolean> {
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
  return Number(row?.count ?? 0) < cap;
}

/** Project-wide TTS characters synthesized this calendar month (§6.5 admin page). */
export async function getMonthlyTtsChars(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${usageLog.amount}), 0)` })
    .from(usageLog)
    .where(and(eq(usageLog.kind, 'tts_chars'), gte(usageLog.createdAt, startOfUtcMonth())));
  return Number(row?.total ?? 0);
}

export async function isUnderMonthlyTtsCharCap(): Promise<boolean> {
  return (await getMonthlyTtsChars()) < MONTHLY_TTS_CHAR_CAP;
}

export async function logUsage(userId: string, kind: string, amount = 1): Promise<void> {
  await db.insert(usageLog).values({ userId, kind, amount });
}
