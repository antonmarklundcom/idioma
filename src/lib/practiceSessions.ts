import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { practiceSessions, utterances } from '@/lib/db/schema';

/**
 * A `practice_sessions` row groups the turns of one sitting. Closing it matters:
 * `getOrCreateSession` reuses the newest OPEN session, so if nothing ever sets
 * `endedAt`, every turn a user records for the rest of time collapses into one
 * endless session - `SessionHistory` degenerates to a single row and every
 * per-session metric (length, turns/session, the Phase 8 weekly recap) is wrong
 * from the first real day of use. That was PLAN.md §16 defect 1.
 *
 * Two mechanisms, because neither is sufficient alone:
 *  - explicit close on leave (`/api/session/end`, via sendBeacon), and
 *  - the idle timeout below, which is the one that actually carries the load:
 *    phones background tabs, kill them, and lose network without ever firing an
 *    unload event.
 */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Timestamp of the last turn in a session, falling back to when it started. */
async function lastActivityAt(sessionId: string, startedAt: Date): Promise<Date> {
  const [last] = await db
    .select({ at: utterances.createdAt })
    .from(utterances)
    .where(eq(utterances.sessionId, sessionId))
    .orderBy(desc(utterances.createdAt))
    .limit(1);
  return last?.at ?? startedAt;
}

export async function getOrCreateSession(args: {
  userId: string;
  languagePairId: string;
  mode: 'lesson' | 'live';
  lessonId?: string;
}): Promise<string> {
  const lessonIdCondition = args.lessonId
    ? eq(practiceSessions.lessonId, args.lessonId)
    : isNull(practiceSessions.lessonId);

  const [existing] = await db
    .select({ id: practiceSessions.id, startedAt: practiceSessions.startedAt })
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

  if (existing) {
    const lastActivity = await lastActivityAt(existing.id, existing.startedAt);
    if (Date.now() - lastActivity.getTime() < SESSION_IDLE_TIMEOUT_MS) return existing.id;

    // Stale. Close it at its last real activity - NOT at now(), or a session
    // abandoned last week would report a week-long duration.
    await db
      .update(practiceSessions)
      .set({ endedAt: lastActivity })
      .where(eq(practiceSessions.id, existing.id));
  }

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

/**
 * Close every open session for a user. Called when they leave a practice page.
 * `endedAt` is now() here, unlike the idle path: the user was present until this
 * moment, so now() is the honest end time.
 */
export async function endOpenSessions(userId: string): Promise<void> {
  await db
    .update(practiceSessions)
    .set({ endedAt: new Date() })
    .where(and(eq(practiceSessions.userId, userId), isNull(practiceSessions.endedAt)));
}
