import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usageLog } from '@/lib/db/schema';

// PLAN.md §6.5: early-warning cap against free-tier abuse / runaway retry loops,
// not a hard product limit - "e.g. 100" lesson attempts/user/day.
export const DAILY_LESSON_ATTEMPT_CAP = 100;

// PLAN.md §6.12 / §16 defect 2. Cloud TTS gives 1M Neural2 characters/month free,
// but it lives in the BILLED project B - so unlike Gemini's free tier it fails OPEN:
// character 1,000,001 does not 429, it silently bills at $16/1M. This constant is the
// only thing enforcing the "$0/month" constraint against a bug (a retry loop, a
// runaway client) rather than against low usage.
//
// 80% of the allotment, deliberately: the remaining 200k is the margin that absorbs
// whatever slips through between the check and the reset, so crossing this cap costs
// synthesis quality for the rest of the month, never money.
export const MONTHLY_TTS_CHAR_CAP = 800_000;

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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

/**
 * Characters synthesized so far this calendar month, across EVERY user.
 *
 * Not per-user, and that is the whole point: the 1M free allotment belongs to the
 * Google Cloud project, not to a person. A per-user cap of 800k would let two users
 * bill us for 600k characters while both sat "under the cap".
 *
 * UTC month boundaries, matching Google Cloud billing periods rather than the
 * learner's local timezone (which is what §12's streak logic uses - different
 * question, deliberately different answer).
 */
export async function getMonthlyTtsCharCount(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${usageLog.amount}), 0)` })
    .from(usageLog)
    .where(and(eq(usageLog.kind, 'tts_chars'), gte(usageLog.createdAt, startOfUtcMonth())));
  return Number(row?.total ?? 0);
}

/**
 * PLAN.md §16 defect 2. Checked before synthesis; over the cap we skip TTS and return
 * text-only feedback. That degradation path already exists and is already non-fatal
 * (§4.5), so exceeding the cap costs the tutor's voice, never an outage and never money.
 */
export async function isUnderMonthlyTtsCharCap(): Promise<boolean> {
  return (await getMonthlyTtsCharCount()) < MONTHLY_TTS_CHAR_CAP;
}

export async function logUsage(userId: string, kind: string, amount = 1): Promise<void> {
  await db.insert(usageLog).values({ userId, kind, amount });
}
