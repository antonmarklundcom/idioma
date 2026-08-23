import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { practiceSessions, usageLog, userStats, users, utterances } from '@/lib/db/schema';

/**
 * One card per learner (ROADMAP.md P1.5b follow-on item 7). Until now the only way to
 * see who exists at all was SQL in the Neon console.
 *
 * Read-only, owner-only, and assembled from tables that are already written on every
 * turn - no new counters, nothing to keep in sync.
 */

// Rough per-unit costs, stated here so the number on the card can be argued with
// rather than believed. TTS is the only one actually billed today: Cloud TTS Neural2
// is $16 per million characters past the free allotment (PLAN.md §6.12). A Gemini
// Flash turn on the free tier is $0, so the attempt estimate exists to answer "what
// would this cost if the free tier went away", which is the question worth asking
// before inviting more people.
const USD_PER_TTS_CHAR = 16 / 1_000_000;
const USD_PER_ATTEMPT_ESTIMATE = 0.002;

export type AdminLearnerCard = {
  userId: string;
  email: string;
  name: string | null;
  role: 'learner' | 'admin';
  level: string | null;
  currentStreak: number;
  longestStreak: number;
  lessonsCompleted: number;
  /** Mistakes per turn, this week and the week before - the trend, not a raw count. */
  mistakesPerTurnThisWeek: number | null;
  mistakesPerTurnLastWeek: number | null;
  turnsThisWeek: number;
  attemptsThisMonth: number;
  ttsCharsThisMonth: number;
  estimatedMonthlyUsd: number;
};

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Mistakes per turn, or null when there were no turns to average over. */
export function mistakesPerTurn(turns: number, mistakes: number): number | null {
  return turns > 0 ? mistakes / turns : null;
}

/** What a month of one learner's usage would cost at the rates above. */
export function estimateMonthlyUsd(args: { attempts: number; ttsChars: number }): number {
  const raw = args.attempts * USD_PER_ATTEMPT_ESTIMATE + args.ttsChars * USD_PER_TTS_CHAR;
  return Math.round(raw * 100) / 100;
}

export async function getAdminLearnerCards(now = new Date()): Promise<AdminLearnerCard[]> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const monthStart = startOfUtcMonth(now);

  const mistakeExpr = sql<number>`coalesce(sum(jsonb_array_length(coalesce(${utterances.errors}, '[]'::jsonb))), 0)`;

  const [people, lessonRows, thisWeekRows, lastWeekRows, usageRows] = await Promise.all([
    db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        level: users.level,
        currentStreak: userStats.currentStreak,
        longestStreak: userStats.longestStreak,
      })
      .from(users)
      .leftJoin(userStats, eq(userStats.userId, users.id)),
    // "Completed" is the same definition the learning path uses: a lesson-mode
    // session that was closed (lib/lessons.ts), so the two numbers cannot disagree.
    db
      .select({ userId: practiceSessions.userId, lessons: sql<number>`count(distinct ${practiceSessions.lessonId})` })
      .from(practiceSessions)
      .where(and(eq(practiceSessions.mode, 'lesson'), sql`${practiceSessions.endedAt} is not null`))
      .groupBy(practiceSessions.userId),
    db
      .select({ userId: utterances.userId, turns: sql<number>`count(*)`, mistakes: mistakeExpr })
      .from(utterances)
      .where(and(gte(utterances.createdAt, weekAgo), lt(utterances.createdAt, now)))
      .groupBy(utterances.userId),
    db
      .select({ userId: utterances.userId, turns: sql<number>`count(*)`, mistakes: mistakeExpr })
      .from(utterances)
      .where(and(gte(utterances.createdAt, twoWeeksAgo), lt(utterances.createdAt, weekAgo)))
      .groupBy(utterances.userId),
    db
      .select({
        userId: usageLog.userId,
        kind: usageLog.kind,
        total: sql<number>`sum(${usageLog.amount})`,
        rows: sql<number>`count(*)`,
      })
      .from(usageLog)
      .where(gte(usageLog.createdAt, monthStart))
      .groupBy(usageLog.userId, usageLog.kind),
  ]);

  const lessonsByUser = new Map(lessonRows.map((r) => [r.userId, Number(r.lessons)]));
  const weekByUser = new Map(thisWeekRows.map((r) => [r.userId, r]));
  const lastWeekByUser = new Map(lastWeekRows.map((r) => [r.userId, r]));
  const attemptsByUser = new Map<string, number>();
  const ttsByUser = new Map<string, number>();
  for (const row of usageRows) {
    if (row.kind === 'lesson_attempt') attemptsByUser.set(row.userId, Number(row.rows));
    if (row.kind === 'tts_chars') ttsByUser.set(row.userId, Number(row.total));
  }

  return people
    .map((person) => {
      const week = weekByUser.get(person.userId);
      const lastWeek = lastWeekByUser.get(person.userId);
      const attemptsThisMonth = attemptsByUser.get(person.userId) ?? 0;
      const ttsCharsThisMonth = ttsByUser.get(person.userId) ?? 0;
      return {
        userId: person.userId,
        email: person.email,
        name: person.name,
        role: person.role,
        level: person.level,
        currentStreak: person.currentStreak ?? 0,
        longestStreak: person.longestStreak ?? 0,
        lessonsCompleted: lessonsByUser.get(person.userId) ?? 0,
        mistakesPerTurnThisWeek: mistakesPerTurn(Number(week?.turns ?? 0), Number(week?.mistakes ?? 0)),
        mistakesPerTurnLastWeek: mistakesPerTurn(
          Number(lastWeek?.turns ?? 0),
          Number(lastWeek?.mistakes ?? 0),
        ),
        turnsThisWeek: Number(week?.turns ?? 0),
        attemptsThisMonth,
        ttsCharsThisMonth,
        estimatedMonthlyUsd: estimateMonthlyUsd({
          attempts: attemptsThisMonth,
          ttsChars: ttsCharsThisMonth,
        }),
      };
    })
    .sort((a, b) => b.turnsThisWeek - a.turnsThisWeek || a.email.localeCompare(b.email));
}
