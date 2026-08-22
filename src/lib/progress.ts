import { and, asc, count, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  errorPatterns,
  lessonContent,
  practiceSessions,
  usageLog,
  userStats,
  utterances,
  type PracticeMode,
  type UtteranceError,
} from '@/lib/db/schema';
import { countDueReviewItems } from '@/lib/srs';
import { GAMIFICATION } from '@/lib/gamification';

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

export type WeeklyRecap = {
  utterances: number;
  practiceDays: number;
  topConqueredMistake: { description: string; occurrenceCount: number } | null;
  xpThisWeek: number;
  xpLastWeek: number;
};

// PLAN.md §8 Phase 8 / §12.2: the weekly recap card. Deliberately estimates XP from
// utterances + usage_log rather than reading a stored history - none exists
// (§12.3: "XP history is not stored separately"), so this reconstructs it from the
// same per-turn/per-grade/per-completion constants /api/lesson/attempt and
// /api/review already award. Rolling 7-day windows, not calendar weeks, so the card
// means the same thing regardless of which day it's viewed on.
async function estimateXpInRange(
  userId: string,
  timezone: string,
  dailyGoalTarget: number,
  start: Date,
  end: Date,
): Promise<number> {
  const [turnRow] = await db
    .select({
      turns: sql<number>`count(*)`,
      zeroErrorTurns: sql<number>`count(*) filter (where coalesce(jsonb_array_length(${utterances.errors}), 0) = 0)`,
    })
    .from(utterances)
    .where(
      and(eq(utterances.userId, userId), gte(utterances.createdAt, start), lt(utterances.createdAt, end)),
    );

  const dayRows = await db
    .select({
      day: sql<string>`to_char(${utterances.createdAt} at time zone ${timezone}, 'YYYY-MM-DD')`,
      turns: sql<number>`count(*)`,
    })
    .from(utterances)
    .where(
      and(eq(utterances.userId, userId), gte(utterances.createdAt, start), lt(utterances.createdAt, end)),
    )
    // Group by the SELECT list's first column ordinally rather than repeating the
    // to_char(...) expression: each sql`` template embeds `timezone` as its own bound
    // parameter, so a repeated expression is only value-equal, not textually identical -
    // Postgres's GROUP BY column-matching requires the latter and rejects the query
    // otherwise (42803). Drizzle doesn't emit `AS "day"` in the raw SQL, so grouping by
    // that alias name fails too (42703) - the ordinal position is what actually works.
    .groupBy(sql`1`);

  const turns = Number(turnRow?.turns ?? 0);
  const zeroErrorTurns = Number(turnRow?.zeroErrorTurns ?? 0);
  const goalMetDays = dayRows.filter((d) => Number(d.turns) >= dailyGoalTarget).length;

  const [creditRow] = await db
    .select({
      reviewGrades: sql<number>`count(*) filter (where ${usageLog.kind} = 'review_grade')`,
      lessonCompletes: sql<number>`count(*) filter (where ${usageLog.kind} = 'lesson_complete')`,
    })
    .from(usageLog)
    .where(and(eq(usageLog.userId, userId), gte(usageLog.createdAt, start), lt(usageLog.createdAt, end)));

  const reviewGrades = Number(creditRow?.reviewGrades ?? 0);
  const lessonCompletes = Number(creditRow?.lessonCompletes ?? 0);

  return (
    turns * GAMIFICATION.XP_PER_TURN +
    zeroErrorTurns * GAMIFICATION.XP_ZERO_ERROR_BONUS +
    goalMetDays * GAMIFICATION.XP_DAILY_GOAL_MET +
    reviewGrades * GAMIFICATION.XP_PER_REVIEW_GRADE +
    lessonCompletes * GAMIFICATION.XP_LESSON_COMPLETE
  );
}

export async function getWeeklyRecap(userId: string, timezone: string | null): Promise<WeeklyRecap> {
  const tz = timezone || 'UTC';
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [stats] = await db.select().from(userStats).where(eq(userStats.userId, userId));
  const dailyGoalTarget = stats?.dailyGoalTarget ?? GAMIFICATION.DEFAULT_DAILY_GOAL_TARGET;

  const [weekRow] = await db
    .select({
      utterances: sql<number>`count(*)`,
      practiceDays: sql<number>`count(distinct to_char(${utterances.createdAt} at time zone ${tz}, 'YYYY-MM-DD'))`,
    })
    .from(utterances)
    .where(and(eq(utterances.userId, userId), gte(utterances.createdAt, weekStart), lt(utterances.createdAt, now)));

  const [xpThisWeek, xpLastWeek] = await Promise.all([
    estimateXpInRange(userId, tz, dailyGoalTarget, weekStart, now),
    estimateXpInRange(userId, tz, dailyGoalTarget, twoWeeksStart, weekStart),
  ]);

  // "Top conquered mistake": prefer one that crossed the 14-day-stale threshold in
  // the last 7 days (a mistake conquered *this week*, matching the card's window);
  // fall back to the strongest currently-conquered pattern so the card isn't empty
  // just because nothing newly tipped over this week.
  const staleCutoff = new Date(now.getTime() - CONQUERED_STALE_DAYS * 24 * 60 * 60 * 1000);
  const conqueredRows = await db
    .select({
      description: errorPatterns.description,
      occurrenceCount: errorPatterns.occurrenceCount,
      lastSeenAt: errorPatterns.lastSeenAt,
    })
    .from(errorPatterns)
    .where(
      and(
        eq(errorPatterns.userId, userId),
        gte(errorPatterns.occurrenceCount, CONQUERED_MIN_OCCURRENCES),
        lt(errorPatterns.lastSeenAt, staleCutoff),
      ),
    )
    .orderBy(desc(errorPatterns.occurrenceCount));

  const conqueredThisWeek = conqueredRows.find((p) => p.lastSeenAt >= weekStart);
  const topPattern = conqueredThisWeek ?? conqueredRows[0] ?? null;

  return {
    utterances: Number(weekRow?.utterances ?? 0),
    practiceDays: Number(weekRow?.practiceDays ?? 0),
    topConqueredMistake: topPattern
      ? { description: topPattern.description, occurrenceCount: topPattern.occurrenceCount }
      : null,
    xpThisWeek,
    xpLastWeek,
  };
}

// ---------------------------------------------------------------------------
// Saved conversations (owner request, Aug 2026)
//
// Nothing new is recorded for this: every turn has always written its transcript,
// the corrected version, the tutor's reply and the structured error list to
// `utterances`. Until now none of it was readable back, so a practice session was
// a number on the dashboard and then gone. These two functions are the read side.
// ---------------------------------------------------------------------------

export type ConversationTurn = {
  id: string;
  transcript: string | null;
  corrected: string | null;
  tutorReply: string | null;
  followUpQuestion: string | null;
  errors: UtteranceError[];
  createdAt: Date;
};

export type Conversation = {
  id: string;
  mode: PracticeMode;
  startedAt: Date;
  endedAt: Date | null;
  lessonTitle: string | null;
  turns: ConversationTurn[];
};

/**
 * One past session, in full. Scoped by userId in the WHERE clause rather than
 * checked afterwards: a transcript is the most personal thing this app stores, so
 * another user's session id must return "not found", never a row.
 */
export async function getConversation(
  sessionId: string,
  userId: string,
): Promise<Conversation | null> {
  const [session] = await db
    .select({
      id: practiceSessions.id,
      mode: practiceSessions.mode,
      startedAt: practiceSessions.startedAt,
      endedAt: practiceSessions.endedAt,
      lessonTitle: lessonContent.title,
    })
    .from(practiceSessions)
    .leftJoin(lessonContent, eq(lessonContent.id, practiceSessions.lessonId))
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)));
  if (!session) return null;

  const rows = await db
    .select({
      id: utterances.id,
      transcript: utterances.transcript,
      corrected: utterances.corrected,
      tutorReply: utterances.tutorReply,
      followUpQuestion: utterances.followUpQuestion,
      errors: utterances.errors,
      createdAt: utterances.createdAt,
    })
    .from(utterances)
    .where(eq(utterances.sessionId, sessionId))
    .orderBy(asc(utterances.createdAt));

  return {
    ...session,
    turns: rows.map((row) => ({ ...row, errors: row.errors ?? [] })),
  };
}

export type ConversationSummary = SessionSummary & {
  lessonTitle: string | null;
  /** First thing the learner said, for a recognisable label in the list. */
  preview: string | null;
  errorCount: number;
};

/**
 * The history list. Sessions with no utterances are dropped - an opened-and-
 * abandoned session is not a conversation, and a list full of empty rows would
 * bury the real ones.
 */
export async function getConversationList(
  userId: string,
  limit = 50,
): Promise<ConversationSummary[]> {
  const sessions = await db
    .select({
      id: practiceSessions.id,
      mode: practiceSessions.mode,
      startedAt: practiceSessions.startedAt,
      endedAt: practiceSessions.endedAt,
      utteranceCount: count(utterances.id),
      lessonTitle: lessonContent.title,
    })
    .from(practiceSessions)
    .leftJoin(utterances, eq(utterances.sessionId, practiceSessions.id))
    .leftJoin(lessonContent, eq(lessonContent.id, practiceSessions.lessonId))
    .where(eq(practiceSessions.userId, userId))
    .groupBy(practiceSessions.id, lessonContent.title)
    .orderBy(desc(practiceSessions.startedAt))
    .limit(limit);

  const withTurns = sessions.filter((s) => s.utteranceCount > 0);
  if (withTurns.length === 0) return [];

  // One extra query for every listed session's turns, rather than N: the preview
  // and the error tally both come out of the same rows.
  const turnRows = await db
    .select({
      sessionId: utterances.sessionId,
      transcript: utterances.transcript,
      errors: utterances.errors,
      createdAt: utterances.createdAt,
    })
    .from(utterances)
    .where(
      inArray(
        utterances.sessionId,
        withTurns.map((s) => s.id),
      ),
    )
    .orderBy(asc(utterances.createdAt));

  const previews = new Map<string, string>();
  const errorCounts = new Map<string, number>();
  for (const row of turnRows) {
    if (row.transcript && !previews.has(row.sessionId)) previews.set(row.sessionId, row.transcript);
    errorCounts.set(row.sessionId, (errorCounts.get(row.sessionId) ?? 0) + (row.errors?.length ?? 0));
  }

  return withTurns.map((s) => ({
    ...s,
    preview: previews.get(s.id) ?? null,
    errorCount: errorCounts.get(s.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// "How am I doing, and what should I fix?" (owner request, Aug 2026)
//
// Deliberately NOT a chart: eight sparse weekly points on a phone answers neither
// question as well as one comparison and a ranked list does. The headline is
// mistakes per turn - turns alone reward talking more, and a raw mistake count
// punishes it.
// ---------------------------------------------------------------------------

export type AccuracyWindow = {
  turns: number;
  mistakes: number;
  /** null when there were no turns: 0.0 would read as a perfect week. */
  mistakesPerTurn: number | null;
};

export type ProgressInsights = {
  thisWeek: AccuracyWindow;
  lastWeek: AccuracyWindow;
  /** The mistakes still happening, worst first - what to actually work on. */
  focusAreas: ErrorPatternWithFlag[];
  conquered: ErrorPatternWithFlag[];
};

async function accuracyBetween(
  userId: string,
  from: Date,
  to: Date,
): Promise<AccuracyWindow> {
  const [row] = await db
    .select({
      turns: sql<number>`count(*)`,
      // errors is nullable jsonb; a null column and an empty array both mean zero.
      mistakes: sql<number>`coalesce(sum(jsonb_array_length(coalesce(${utterances.errors}, '[]'::jsonb))), 0)`,
    })
    .from(utterances)
    .where(
      and(
        eq(utterances.userId, userId),
        gte(utterances.createdAt, from),
        lt(utterances.createdAt, to),
      ),
    );

  const turns = Number(row?.turns ?? 0);
  const mistakes = Number(row?.mistakes ?? 0);
  return { turns, mistakes, mistakesPerTurn: turns > 0 ? mistakes / turns : null };
}

export async function getProgressInsights(userId: string): Promise<ProgressInsights> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [thisWeek, lastWeek, patternRows] = await Promise.all([
    accuracyBetween(userId, weekAgo, now),
    accuracyBetween(userId, twoWeeksAgo, weekAgo),
    db
      .select()
      .from(errorPatterns)
      .where(eq(errorPatterns.userId, userId))
      .orderBy(desc(errorPatterns.occurrenceCount), desc(errorPatterns.lastSeenAt)),
  ]);

  const staleCutoff = Date.now() - CONQUERED_STALE_DAYS * 24 * 60 * 60 * 1000;
  const patterns: ErrorPatternWithFlag[] = patternRows.map((p) => ({
    ...p,
    conquered:
      p.occurrenceCount >= CONQUERED_MIN_OCCURRENCES && p.lastSeenAt.getTime() < staleCutoff,
  }));

  return {
    thisWeek,
    lastWeek,
    // Three, not ten: a list of everything you have ever got wrong is a wall, not
    // a plan. The rest stay on the dashboard's full pattern list.
    focusAreas: patterns.filter((p) => !p.conquered).slice(0, 3),
    conquered: patterns.filter((p) => p.conquered).slice(0, 3),
  };
}
