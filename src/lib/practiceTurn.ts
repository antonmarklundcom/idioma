import { db } from '@/lib/db';
import { utterances, type PracticeMode } from '@/lib/db/schema';
import { getOrCreateSession } from '@/lib/sessions';
import { recordErrorPatterns } from '@/lib/errorPatterns';
import { logUsage } from '@/lib/usage';
import { persistTurnStats } from '@/lib/gamification';
import type { StreakStateWithXp } from '@/lib/gamification';
import type { FeedbackResult } from '@/lib/zodSchemas';

/**
 * Everything /api/lesson/attempt writes for one turn, in one place.
 *
 * PLAN.md §8 Phase 7B item 1: this is called from Next.js 16's `after()`, so the
 * learner's audio is already playing while these run. Two consequences worth stating
 * because they are the whole point:
 *
 *   1. Order still matters HERE even though it no longer blocks the client. The
 *      session row must exist before the utterance references it, and the utterance
 *      must be on disk before anything counts turns.
 *   2. It must never throw into the void unnoticed. `after()` failures don't reach the
 *      client - by then there is no response left to fail - so every step is logged
 *      loudly enough to find in the server log, and one failing step does not abandon
 *      the ones after it. A missing usage_log row is bad (it guards real money, §6.5);
 *      a missing usage_log row that also cost us the utterance is worse.
 *
 * What does NOT change: the same row, with the same columns, is written for a
 * lesson-mode turn and a live-mode turn (§4.3 point 5). Live practice feeds the same
 * dashboard as lesson practice, which is the mode's entire justification.
 *
 * One interaction worth naming: the leave beacon (§16 defect 1) can now, in principle,
 * fire in the sliver between the response and this function's first write, find no open
 * session and close nothing. That is precisely what the 30-minute idle sweep in
 * `getOrCreateSession` exists to catch - §16 already says the defensive half matters
 * more than the beacon, and this widens the window it covers by well under a second.
 */
export async function persistTurn(args: {
  userId: string;
  languagePairId: string;
  mode: PracticeMode;
  lessonId?: string;
  feedback: FeedbackResult;
  /** Characters actually synthesized, or 0 when TTS was skipped/failed. */
  ttsCharCount: number;
  gamificationState: StreakStateWithXp;
}): Promise<void> {
  const step = async (name: string, run: () => Promise<unknown>) => {
    try {
      await run();
      return true;
    } catch (err) {
      console.error(`[lesson/attempt] after(): ${name} failed`, err);
      return false;
    }
  };

  let sessionId: string | null = null;
  try {
    sessionId = await getOrCreateSession({
      userId: args.userId,
      languagePairId: args.languagePairId,
      mode: args.mode,
      lessonId: args.lessonId,
    });
  } catch (err) {
    console.error('[lesson/attempt] after(): getOrCreateSession failed', err);
  }

  if (sessionId) {
    await step('utterance insert', () =>
      db.insert(utterances).values({
        sessionId,
        userId: args.userId,
        speaker: 'user',
        transcript: args.feedback.transcription,
        corrected: args.feedback.correctedUtterance,
        tutorReply: args.feedback.tutorReply,
        followUpQuestion: args.feedback.followUpQuestion,
        errors: args.feedback.errors,
      }),
    );
  }

  if (args.feedback.errors.length > 0) {
    // Also enqueues/reactivates SRS items (§13.2).
    await step('error patterns', () =>
      recordErrorPatterns({
        userId: args.userId,
        languagePairId: args.languagePairId,
        errors: args.feedback.errors,
      }),
    );
  }

  await step('usage log', () => logUsage(args.userId, 'lesson_attempt'));
  if (args.ttsCharCount > 0) {
    await step('tts usage log', () => logUsage(args.userId, 'tts_chars', args.ttsCharCount));
  }

  // PLAN.md §2 step ⑦ / §12. The numbers were computed on the response path and are
  // already on the learner's screen; this is only the write.
  await step('user stats', () => persistTurnStats(args.userId, args.gamificationState));
}
