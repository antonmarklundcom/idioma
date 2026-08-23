import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { lessonAudio } from '@/lib/db/schema';

/**
 * The durable half of the lesson-audio cache (the in-process Map in
 * `lib/listenAudioCache.ts` is the other, and sits in front of this one).
 *
 * Same content key, three different lifetimes:
 *   in-process Map  - microseconds, dies with the process, 50 entries
 *   this table      - a query, survives restarts and deploys, the whole library
 *   Google          - a round trip, and characters off the monthly allowance
 *
 * A tap on a vocab chip should reach the third of those exactly once per phrase in the
 * lifetime of the app, and after `npm run audio:generate` it never reaches it at all.
 */

export type StoredAudio = { audioBase64: string; charCount: number };

export async function getStoredLessonAudio(cacheKey: string): Promise<StoredAudio | null> {
  const [row] = await db
    .select({ audioBase64: lessonAudio.audioBase64, charCount: lessonAudio.charCount })
    .from(lessonAudio)
    .where(eq(lessonAudio.cacheKey, cacheKey))
    .limit(1);
  return row ?? null;
}

/**
 * Stores one recording. Idempotent on the content key, so the generator can be re-run
 * and the request path can store a recording the generator has not reached yet without
 * either of them having to check first.
 */
export async function putStoredLessonAudio(args: {
  cacheKey: string;
  lessonId: string;
  audioBase64: string;
  charCount: number;
}): Promise<void> {
  await db
    .insert(lessonAudio)
    .values(args)
    .onConflictDoNothing({ target: lessonAudio.cacheKey });
}

/** How much of the library exists, for the admin panel and the generator's report. */
export async function countStoredLessonAudio(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(lessonAudio);
  return Number(row?.count ?? 0);
}
