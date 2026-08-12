import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userStats, users, utterances } from '@/lib/db/schema';

// PLAN.md §12.2: every XP/streak value in ONE exported constants object.
export const GAMIFICATION = {
  XP_PER_TURN: 10,
  XP_ZERO_ERROR_BONUS: 5,
  XP_LESSON_COMPLETE: 25,
  XP_PER_REVIEW_GRADE: 5,
  XP_DAILY_GOAL_MET: 15,
  DEFAULT_DAILY_GOAL_TARGET: 3,
  STREAK_MILESTONES: [7, 30, 100],
} as const;

// --- Timezone-aware day math (§12.2: streaks computed in the USER's timezone, ----
// never server UTC, or Asunción and Stockholm would corrupt each other). No date
// library dependency - Intl.DateTimeFormat gives us everything needed. -------------

function localDateString(timezone: string, date: Date): string {
  // 'en-CA' formats as YYYY-MM-DD, which is exactly the sortable/diffable shape we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function timezoneOffsetMinutes(timezone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

function startOfLocalDayUtc(timezone: string, date: Date): Date {
  const offsetMinutes = timezoneOffsetMinutes(timezone, date);
  const local = new Date(date.getTime() + offsetMinutes * 60000);
  const localMidnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(localMidnightUtc - offsetMinutes * 60000);
}

function daysBetween(earlier: string, later: string): number {
  const [ay, am, ad] = earlier.split('-').map(Number);
  const [by, bm, bd] = later.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Standard ISO-8601 week algorithm (Thursday-of-the-week trick), operating on a
// 'YYYY-MM-DD' local date string.
function isoWeekString(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// --- Streak transition (pure, easy to reason about in isolation) -------------------

type StreakState = {
  currentStreak: number;
  longestStreak: number;
  lastGoalMetDate: string | null;
  streakShieldUsedInWeek: string | null;
};

// PLAN.md §12.2: a 1-day gap continues the streak; a 2-day gap (one full missed day)
// is bridged by the weekly auto-shield if unused; anything wider resets to 1.
function applyDailyGoalMet(state: StreakState, today: string): StreakState {
  if (state.lastGoalMetDate === today) return state; // idempotent if called twice

  let currentStreak: number;
  let streakShieldUsedInWeek = state.streakShieldUsedInWeek;

  if (state.lastGoalMetDate === null) {
    currentStreak = 1;
  } else {
    const gap = daysBetween(state.lastGoalMetDate, today);
    const thisWeek = isoWeekString(today);
    if (gap === 1) {
      currentStreak = state.currentStreak + 1;
    } else if (gap === 2 && streakShieldUsedInWeek !== thisWeek) {
      currentStreak = state.currentStreak + 1;
      streakShieldUsedInWeek = thisWeek;
    } else {
      currentStreak = 1;
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(state.longestStreak, currentStreak),
    lastGoalMetDate: today,
    streakShieldUsedInWeek,
  };
}

async function getOrCreateUserStats(userId: string) {
  const [existing] = await db.select().from(userStats).where(eq(userStats.userId, userId));
  if (existing) return existing;

  const [created] = await db
    .insert(userStats)
    .values({ userId, dailyGoalTarget: GAMIFICATION.DEFAULT_DAILY_GOAL_TARGET })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  // Two concurrent turns raced to create the row - re-read the winner's row.
  const [row] = await db.select().from(userStats).where(eq(userStats.userId, userId));
  return row;
}

async function countTurnsToday(userId: string, timezone: string, now: Date): Promise<number> {
  const startOfToday = startOfLocalDayUtc(timezone, now);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(utterances)
    .where(and(eq(utterances.userId, userId), gte(utterances.createdAt, startOfToday)));
  return Number(row?.count ?? 0);
}

export type CelebrationEvent = { type: 'streak_milestone'; milestone: number };

export type GamificationResult = {
  xpAwarded: number;
  xpTotal: number;
  currentStreak: number;
  longestStreak: number;
  dailyGoalTarget: number;
  turnsToday: number;
  dailyGoalMet: boolean;
  celebration: CelebrationEvent | null;
};

// PLAN.md §2 step ⑦: called once per recorded turn, after the utterance is already
// persisted (so turnsToday's count includes this turn).
export async function recordTurnAndUpdateStats(args: {
  userId: string;
  timezone: string | null;
  hadZeroErrors: boolean;
  now?: Date;
}): Promise<GamificationResult> {
  const timezone = args.timezone || 'UTC';
  const now = args.now ?? new Date();
  const stats = await getOrCreateUserStats(args.userId);
  const turnsToday = await countTurnsToday(args.userId, timezone, now);
  const today = localDateString(timezone, now);

  let xpAwarded = GAMIFICATION.XP_PER_TURN;
  if (args.hadZeroErrors) xpAwarded += GAMIFICATION.XP_ZERO_ERROR_BONUS;

  let streak: StreakState = stats;
  let dailyGoalMet = stats.lastGoalMetDate === today;
  let celebration: CelebrationEvent | null = null;

  if (!dailyGoalMet && turnsToday >= stats.dailyGoalTarget) {
    streak = applyDailyGoalMet(stats, today);
    dailyGoalMet = true;
    xpAwarded += GAMIFICATION.XP_DAILY_GOAL_MET;
    if ((GAMIFICATION.STREAK_MILESTONES as readonly number[]).includes(streak.currentStreak)) {
      celebration = { type: 'streak_milestone', milestone: streak.currentStreak };
    }
  }

  const xpTotal = stats.xpTotal + xpAwarded;

  await db
    .update(userStats)
    .set({
      xpTotal,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastGoalMetDate: streak.lastGoalMetDate,
      streakShieldUsedInWeek: streak.streakShieldUsedInWeek,
      updatedAt: new Date(),
    })
    .where(eq(userStats.userId, args.userId));

  return {
    xpAwarded,
    xpTotal,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    dailyGoalTarget: stats.dailyGoalTarget,
    turnsToday,
    dailyGoalMet,
    celebration,
  };
}

export type XpAward = { xpAwarded: number; xpTotal: number };

// PLAN.md §12.2 XP that isn't tied to a spoken turn: a graded review item (+5) and
// a completed lesson (+25). Streak and daily-goal state are deliberately untouched
// - both are driven by turns, and a review answer has already been through
// recordTurnAndUpdateStats (via /api/lesson/attempt) by the time its grade lands,
// which is how review counts toward the daily goal. Incremented in SQL rather than
// read-modify-write so a grade and a turn landing together can't lose XP.
export async function awardXp(userId: string, amount: number): Promise<XpAward> {
  await getOrCreateUserStats(userId);

  const [row] = await db
    .update(userStats)
    .set({ xpTotal: sql`${userStats.xpTotal} + ${amount}`, updatedAt: new Date() })
    .where(eq(userStats.userId, userId))
    .returning({ xpTotal: userStats.xpTotal });

  return { xpAwarded: amount, xpTotal: row?.xpTotal ?? amount };
}

export type UserStatsSummary = {
  xpTotal: number;
  currentStreak: number;
  longestStreak: number;
  dailyGoalTarget: number;
  turnsToday: number;
  dailyGoalMet: boolean;
};

// Read-only - for the app-shell header (DailyGoalRing/StreakBadge) and the dashboard.
// Creates a default row on first read but never mutates streak state.
export async function getUserStatsSummary(
  userId: string,
  timezone: string | null,
): Promise<UserStatsSummary> {
  const tz = timezone || 'UTC';
  const now = new Date();
  const stats = await getOrCreateUserStats(userId);
  const turnsToday = await countTurnsToday(userId, tz, now);
  const today = localDateString(tz, now);

  return {
    xpTotal: stats.xpTotal,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    dailyGoalTarget: stats.dailyGoalTarget,
    turnsToday,
    dailyGoalMet: stats.lastGoalMetDate === today,
  };
}

// PLAN.md §12.2 "Couple mechanic": the beta has exactly two users: show the other
// user's streak next to yours, gentle mutual accountability, gated by an env flag
// so it degrades cleanly if that assumption ever stops holding.
export async function getPartnerStreak(
  userId: string,
): Promise<{ name: string | null; currentStreak: number } | null> {
  if (process.env.SHOW_PARTNER_STREAK !== 'true') return null;

  const [partner] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(sql`${users.id} != ${userId}`, sql`${users.languagePairId} is not null`))
    .limit(1);
  if (!partner) return null;

  const [stats] = await db.select().from(userStats).where(eq(userStats.userId, partner.id));
  return { name: partner.name, currentStreak: stats?.currentStreak ?? 0 };
}
