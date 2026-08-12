import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { practiceSessions, utterances } from '@/lib/db/schema';

// PLAN.md §16 defect 1: a practice session ends when the learner leaves, or - because
// phones background and kill tabs without warning - when it has been idle this long.
export const SESSION_IDLE_TIMEOUT_MINUTES = 30;

export type PracticeSessionKey = {
  userId: string;
  languagePairId: string;
  mode: 'lesson' | 'live';
  lessonId?: string | null;
};

// The one definition of "the caller's own open session(s)" - shared by the lookup, the
// idle sweep and /api/session/end so the three can never disagree about which rows they
// are talking about.
function openSessionsFor(key: PracticeSessionKey): SQL | undefined {
  return and(
    eq(practiceSessions.userId, key.userId),
    eq(practiceSessions.languagePairId, key.languagePairId),
    eq(practiceSessions.mode, key.mode),
    key.lessonId ? eq(practiceSessions.lessonId, key.lessonId) : isNull(practiceSessions.lessonId),
    isNull(practiceSessions.endedAt),
  );
}

// A session ended when its last turn was recorded, not when we noticed it was over.
// Both close paths stamp `ended_at` with this, so a session closed by the leave beacon
// and one closed by the idle sweep mean exactly the same thing - which is the point:
// every future per-session metric is derived from this column.
const lastActivityAt = sql`coalesce(
  (select max(${utterances.createdAt}) from ${utterances} where ${utterances.sessionId} = ${practiceSessions.id}),
  ${practiceSessions.startedAt}
)`;

/**
 * Closes the caller's open practice sessions for one (pair, mode, lesson) key.
 *
 * Set-based and idempotent on purpose. It is a single UPDATE, so two tabs racing it
 * cannot both close the same row: the second statement re-evaluates its WHERE against
 * the row the first one already committed, sees `ended_at IS NOT NULL`, and matches
 * nothing. And because it closes *every* matching open row rather than the newest one,
 * a duplicate left behind by an earlier race is swept up the next time it goes idle.
 *
 * `onlyIfIdle` is the defensive half of the fix; without it this is the explicit
 * "learner left" close.
 */
export async function closeOpenSessions(
  key: PracticeSessionKey,
  opts: { onlyIfIdle?: boolean } = {},
): Promise<number> {
  // Both sides of the comparison come from the database clock: `started_at`/`created_at`
  // were written by `now()`, so comparing against `now()` here stays correct whatever the
  // connection's TimeZone happens to be.
  const idleCondition = opts.onlyIfIdle
    ? sql`${lastActivityAt} < now() - make_interval(mins => ${SESSION_IDLE_TIMEOUT_MINUTES}::int)`
    : undefined;

  const closed = await db
    .update(practiceSessions)
    .set({ endedAt: lastActivityAt })
    .where(and(openSessionsFor(key), idleCondition))
    .returning({ id: practiceSessions.id });

  return closed.length;
}

/**
 * Resolves the practice session a turn belongs to, closing an abandoned one first.
 *
 * Worst case under concurrency (two tabs, same user, same key, both finding no open
 * session in the same instant) is two open rows rather than one. That is benign: each
 * turn is still attached to a real session, later turns all funnel into the newest row,
 * and the stray is closed by the idle sweep. Nothing is left half-closed.
 */
export async function getOrCreateSession(key: PracticeSessionKey): Promise<string> {
  await closeOpenSessions(key, { onlyIfIdle: true });

  const [existing] = await db
    .select({ id: practiceSessions.id })
    .from(practiceSessions)
    .where(openSessionsFor(key))
    .orderBy(desc(practiceSessions.startedAt))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(practiceSessions)
    .values({
      userId: key.userId,
      languagePairId: key.languagePairId,
      mode: key.mode,
      lessonId: key.lessonId ?? null,
    })
    .returning({ id: practiceSessions.id });

  return created.id;
}
