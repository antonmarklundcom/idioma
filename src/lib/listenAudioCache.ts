import { createHash } from 'node:crypto';

/**
 * Synthesized audio for listening exercises, kept in process (PLAN.md §5B, §6.12).
 *
 * Why it exists: a `listen_prompt`'s `audioText` is STATIC content. Every replay of the
 * same exercise - and a learner replays a listening prompt several times on purpose -
 * used to re-synthesize identical bytes and re-bill the characters against the same
 * 1M/month allotment that §6.12 says is the only thing between this project and a
 * silent bill. Tutor feedback is not cacheable (every reply is new text); this is.
 *
 * Why an in-process Map is allowed here, given §2 forbids module-scope caching:
 * §2's rule is about PER-USER state, which would go wrong the moment the app runs as
 * more than one process. This is keyed by CONTENT - lesson text, voice, speaking rate -
 * so two processes simply each hold their own copy of the same immutable bytes, and a
 * restart costs one re-synthesis, not a correctness bug. Nothing user-scoped may join
 * this map.
 *
 * The tradeoff, stated: it is per-process and unshared, so a horizontally scaled deploy
 * multiplies the miss rate, and the cap below bounds heap rather than being tuned. At
 * two users on one Hostinger Node process (§6.13) that is the right size of solution; if
 * this ever needs to survive a restart or be shared, it becomes a database column or a
 * Cloud Storage object, not a bigger Map.
 */

type CachedAudio = { audioBase64: string; charCount: number };

// ~50 distinct (exercise, voice, rate) combinations. An MP3 sentence is tens of KB, so
// this is single-digit megabytes at worst - small next to the Node process itself.
const MAX_ENTRIES = 50;

const cache = new Map<string, CachedAudio>();

/**
 * The key includes everything that changes the BYTES:
 * - the exercise's text, hashed - so editing a lesson through /admin (§2 PUT) can never
 *   serve the old recording for the new words; the key simply stops matching.
 * - the voice, which is per language pair, and the speaking rate, which is per CEFR
 *   level (§4.5) - two learners at different levels hear the same sentence at
 *   different speeds and must not share an entry.
 * `lessonId`/`exerciseIndex` are in the key too so a cache line is identifiable in a
 * debug session; they are not sufficient on their own, per the first point.
 */
export function listenAudioKey(args: {
  lessonId: string;
  exerciseIndex: number;
  voice: string;
  speakingRate: number;
  audioText: string;
  /**
   * Which list `exerciseIndex` indexes into. The vocab step (ROADMAP.md P1.5) plays
   * from `content.vocab`, so vocab item 0 and exercise 0 are different recordings
   * that would otherwise be one key apart only by their text hash. Defaults to
   * 'exercise' so existing call sites keep their keys.
   */
  slot?: 'exercise' | 'vocab';
}): string {
  const textHash = createHash('sha256').update(args.audioText).digest('hex').slice(0, 16);
  return [
    args.lessonId,
    args.exerciseIndex,
    args.voice,
    args.speakingRate,
    textHash,
    args.slot ?? 'exercise',
  ].join('|');
}

export function getCachedListenAudio(key: string): CachedAudio | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  // Re-insert so the eviction below drops the least recently USED entry, not the
  // oldest one: a lesson in active rotation shouldn't be evicted by a lesson opened once.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function setCachedListenAudio(key: string, value: CachedAudio): void {
  cache.set(key, value);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}
