import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usageLog, users } from '@/lib/db/schema';

// PLAN.md §6.5: early-warning cap against free-tier abuse / runaway retry loops,
// not a hard product limit - "e.g. 100" lesson attempts/user/day.
const DAILY_LESSON_ATTEMPT_CAP = 100;

// PLAN.md §6.12: Cloud TTS Neural2 free allotment is 1M chars/month, GLOBAL across
// all users (the Google project's allotment, not a per-user one). Past this, Google
// bills at $16/1M chars - the admin page exists so that bill is never a surprise.
const MONTHLY_TTS_CHAR_CAP = 1_000_000;

// PLAN.md §16 defect 2: synthesis stops at ~80% of the allotment, which is also the
// point the admin dashboard turns amber (§6.5). One fraction, derived once - so "warn
// at 80%, stop at 80%" cannot drift into two numbers that quietly disagree. The gap
// between the stop point and the allotment is deliberate headroom: TTS lives in the
// billed Google project, so overshooting the real 1M silently costs money.
const TTS_STOP_FRACTION = 0.8;
const MONTHLY_TTS_CHAR_STOP = Math.floor(MONTHLY_TTS_CHAR_CAP * TTS_STOP_FRACTION);

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
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

export async function getMonthlyTtsCharCount(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${usageLog.amount}), 0)` })
    .from(usageLog)
    .where(and(eq(usageLog.kind, 'tts_chars'), gte(usageLog.createdAt, startOfUtcMonth())));
  return Number(row?.total ?? 0);
}

/**
 * PLAN.md §16 defect 2. Global, not per-user: the allotment belongs to the Google
 * project, so one user's runaway retry loop spends the other's quota too.
 *
 * `pendingChars` is the length of the reply we are about to synthesize, counted before
 * the call rather than after it - Google bills on input characters, so the only way to
 * never knowingly cross the line is to add the request's own cost before deciding. Two
 * requests reading the same total concurrently can still overshoot by a reply or two
 * (~300 chars each); that is why the stop point sits 200,000 chars below the billed
 * threshold instead of on it.
 */
export async function isUnderMonthlyTtsCharCap(pendingChars = 0): Promise<boolean> {
  const used = await getMonthlyTtsCharCount();
  return used + pendingChars <= MONTHLY_TTS_CHAR_STOP;
}

export type AdminUsageDailyPoint = {
  date: string; // 'YYYY-MM-DD', UTC
  lessonAttempts: number;
  ttsChars: number;
};

export type AdminUsagePerUser = {
  userId: string;
  email: string;
  name: string | null;
  lessonAttemptsToday: number;
};

export type AdminUsageSummary = {
  dailyLessonAttemptCap: number;
  monthlyTtsCharCap: number;
  /** Where synthesis actually stops - always < monthlyTtsCharCap. */
  monthlyTtsCharStop: number;
  monthlyTtsCharCount: number;
  perUserToday: AdminUsagePerUser[];
  dailySeries: AdminUsageDailyPoint[];
};

// PLAN.md §6.5: early-warning dashboard, not a per-user metering feature. Reads
// only - never touches caps or /api/lesson/attempt behaviour.
export async function getAdminUsageSummary(): Promise<AdminUsageSummary> {
  const todayStart = startOfUtcDay();
  const seriesStart = new Date(todayStart);
  seriesStart.setUTCDate(seriesStart.getUTCDate() - 13);

  const [perUserToday, seriesRows, monthlyTtsCharCount] = await Promise.all([
    db
      .select({
        userId: usageLog.userId,
        email: users.email,
        name: users.name,
        lessonAttemptsToday: sql<number>`count(*)`,
      })
      .from(usageLog)
      .innerJoin(users, eq(users.id, usageLog.userId))
      .where(
        and(
          eq(usageLog.kind, 'lesson_attempt'),
          gte(usageLog.createdAt, todayStart),
        ),
      )
      .groupBy(usageLog.userId, users.email, users.name),
    db
      .select({
        date: sql<string>`to_char(${usageLog.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        kind: usageLog.kind,
        total: sql<number>`sum(${usageLog.amount})`,
      })
      .from(usageLog)
      .where(
        and(
          gte(usageLog.createdAt, seriesStart),
          sql`${usageLog.kind} in ('lesson_attempt', 'tts_chars')`,
        ),
      )
      .groupBy(sql`to_char(${usageLog.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`, usageLog.kind),
    getMonthlyTtsCharCount(),
  ]);

  const byDate = new Map<string, AdminUsageDailyPoint>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(seriesStart);
    d.setUTCDate(d.getUTCDate() + i);
    const key = utcDateKey(d);
    byDate.set(key, { date: key, lessonAttempts: 0, ttsChars: 0 });
  }
  for (const row of seriesRows) {
    const point = byDate.get(row.date);
    if (!point) continue;
    if (row.kind === 'lesson_attempt') point.lessonAttempts = Number(row.total);
    if (row.kind === 'tts_chars') point.ttsChars = Number(row.total);
  }

  return {
    dailyLessonAttemptCap: DAILY_LESSON_ATTEMPT_CAP,
    monthlyTtsCharCap: MONTHLY_TTS_CHAR_CAP,
    monthlyTtsCharStop: MONTHLY_TTS_CHAR_STOP,
    monthlyTtsCharCount,
    perUserToday: perUserToday.map((r) => ({
      userId: r.userId,
      email: r.email,
      name: r.name,
      lessonAttemptsToday: Number(r.lessonAttemptsToday),
    })),
    dailySeries: Array.from(byDate.values()),
  };
}
