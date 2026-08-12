import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { practiceSessions, utterances } from '@/lib/db/schema';

/**
 * PLAN.md §16 defect 1.
 *
 * `practice_sessions.endedAt` was declared, read by the open-session lookup below and
 * surfaced on the dashboard, but nothing ever set it - so every turn a user recorded
 * collapsed into one endless session, and any per-session metric (length, turns per
 * session, the Phase 8 weekly recap) was wrong from the first day of real use.
 *
 * Two halves close a session, and the defensive half matters more than the explicit
 * one: phones background tabs without firing anything, so the beacon from
 * `/api/session/end` is best-effort and the idle sweep is what actually guarantees
 * correctness.
 */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Closes a session at the moment it really stopped - its last utterance - not at the
 * moment we noticed. Using `now()` would silently inflate every abandoned session by
 * however long it sat idle, which is precisely the metric this defect was corrupting.
 * A session with no utterances at all never happened; it collapses to zero length.
 */
const endedAtFromLastUtterance = sql`coalesce(
  (select max(${utterances.createdAt}) from ${utterances}
    where ${utterances.sessionId} = ${practiceSessions.id}),
  ${practiceSessions.startedAt}
)`;

/**
 * Marks every stale open session for this user as ended. Idempotent, and cheap enough
 * to run on the practice path: it touches only rows that are already open, and at beta
 * scale that is at most a handful.
 */
export async function closeStaleSessions(userId: string): Promise<void> {
  const idleCutoff = new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS);

  await db
    .update(practiceSessions)
    .set({ endedAt: endedAtFromLastUtterance })
    .where(
      and(
        eq(practiceSessions.userId, userId),
        isNull(practiceSessions.endedAt),
        // Idle = nothing spoken recently. Falls back to startedAt so a session that
        // never got a single utterance still ages out instead of living forever.
        sql`coalesce(
          (select max(${utterances.createdAt}) from ${utterances}
            where ${utterances.sessionId} = ${practiceSessions.id}),
          ${practiceSessions.startedAt}
        ) < ${idleCutoff}`,
      ),
    );
}

/**
 * Ends one session explicitly (the `/api/session/end` beacon). Scoped to the owner, so
 * a guessed session id from another account is a no-op rather than a denial of service.
 * Already-ended sessions are left alone - a beacon can arrive after the idle sweep has
 * already closed the row, and the first close is the truthful one.
 */
export async function endSession(userId: string, sessionId: string): Promise<void> {
  await db
    .update(practiceSessions)
    .set({ endedAt: endedAtFromLastUtterance })
    .where(
      and(
        eq(practiceSessions.id, sessionId),
        eq(practiceSessions.userId, userId),
        isNull(practiceSessions.endedAt),
      ),
    );
}

export async function getOrCreateSession(args: {
  userId: string;
  languagePairId: string;
  mode: 'lesson' | 'live';
  lessonId?: string;
}): Promise<string> {
  // Sweep first: an open-but-stale row must not be reused as "the current session",
  // which is exactly how the endless-session bug reproduced.
  await closeStaleSessions(args.userId);

  const lessonIdCondition = args.lessonId
    ? eq(practiceSessions.lessonId, args.lessonId)
    : isNull(practiceSessions.lessonId);

  const [existing] = await db
    .select({ id: practiceSessions.id })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.userId, args.userId),
        eq(practiceSessions.languagePairId, args.languagePairId),
        eq(practiceSessions.mode, args.mode),
        isNull(practiceSessions.endedAt),
        lessonIdCondition,
      ),
    )
    .orderBy(desc(practiceSessions.startedAt))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(practiceSessions)
    .values({
      userId: args.userId,
      languagePairId: args.languagePairId,
      mode: args.mode,
      lessonId: args.lessonId ?? null,
    })
    .returning({ id: practiceSessions.id });

  return created.id;
}
