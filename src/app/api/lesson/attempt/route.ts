import { NextResponse, after } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { errorPatterns, languagePairs } from '@/lib/db/schema';
import {
  feedbackResultSchema,
  lessonAttemptRequestSchema,
  quickReplySchema,
  type FeedbackResult,
  type QuickReply,
} from '@/lib/zodSchemas';
import { getProviderForTask, type FeedbackArgs, type LlmProvider } from '@/lib/llm/provider';
import { ProviderRateLimitError } from '@/lib/llm/errors';
import { tierAllowsMode } from '@/lib/tier';
import {
  assembleSystemPrompt,
  buildReviewPromptContext,
  FACT_LEARNING_INSTRUCTION,
  FREE_PRACTICE_LESSON_CONTEXT,
  QUICK_REPLY_INSTRUCTION,
} from '@/lib/gemini/prompts';
import { saveLearnedFact } from '@/lib/profileFacts';
import {
  buildDialoguePromptContext,
  buildExercisePromptContext,
  getLessonForPair,
} from '@/lib/lessons';
import { getReviewItemForUser } from '@/lib/srs';
import { synthesizeTutorSpeech } from '@/lib/tts';
import {
  getMonthlyTtsCharCount,
  isUnderDailyLessonAttemptCap,
  isUnderMonthlyTtsCharCapFor,
  logUsage,
} from '@/lib/usage';
import { computeTurnStats, loadTurnStatsSnapshot } from '@/lib/gamification';
import { persistTurn } from '@/lib/practiceTurn';

// Gemini audio calls can take 5-20s. Hostinger's long-lived Node process imposes no
// function timeout (PLAN.md §6.1/§6.13); kept as documented intent and portability
// insurance if hosting ever moves back to a serverless platform. It also bounds the
// `after()` work below, which runs under the same budget.
export const maxDuration = 60;

async function getValidatedFeedback(args: {
  provider: LlmProvider;
  model: string;
  systemPrompt: string;
  userTurnContext: string;
  input: FeedbackArgs['input'];
}): Promise<FeedbackResult> {
  // PLAN.md §4.1: Zod-parse before trusting model output; retry once on mismatch.
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await args.provider.getFeedback({
      systemPrompt: args.systemPrompt,
      userTurnContext: args.userTurnContext,
      input: args.input,
      model: args.model,
    });
    const parsed = feedbackResultSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  throw new Error('invalid_model_output');
}

/**
 * PLAN.md §8 Phase 7B item 1, "speak before you analyze".
 *
 * The short call that produces only what the learner is about to HEAR, so Cloud TTS can
 * start while the structured-feedback call is still running. Never retried and never
 * fatal: if it fails or comes back malformed, the turn falls back to the reply from the
 * structured call and the learner gets the old serial timing instead of an error.
 */
async function getQuickReply(args: {
  provider: LlmProvider;
  model: string;
  systemPrompt: string;
  userTurnContext: string;
  input: FeedbackArgs['input'];
}): Promise<QuickReply | null> {
  if (!args.provider.getQuickReply) return null;
  try {
    const raw = await args.provider.getQuickReply({
      systemPrompt: args.systemPrompt + QUICK_REPLY_INSTRUCTION,
      userTurnContext: args.userTurnContext,
      input: args.input,
      model: args.model,
    });
    const parsed = quickReplySchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.warn('[lesson/attempt] quick reply failed - falling back to the serial path', err);
    return null;
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }
  if (!session.user.languagePairId) {
    return NextResponse.json(
      { error: 'Complete onboarding first', code: 'onboarding_incomplete' },
      { status: 400 },
    );
  }
  const userId = session.user.id;
  const languagePairId = session.user.languagePairId;

  const body = await request.json().catch(() => null);
  const parsedBody = lessonAttemptRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'validation_error', details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }
  const {
    input,
    lessonId,
    exerciseIndex,
    dialogueLineIndex,
    reviewItemId,
    promptContext,
    spokenSeconds,
    mode,
    noSpokenReply,
  } = parsedBody.data;

  // PLAN.md §15.3: the capability gate, checked before anything is read or spent. It is
  // server-side only by design - the browser can post to this route directly, so a
  // client-side check would be decoration. Both beta users sit on 'premium' (the seed
  // sets them), so as shipped nobody meets this; it exists so that turning on an
  // expensive mode is a per-user SQL statement instead of a redeploy.
  if (!tierAllowsMode(session.user.tier, mode)) {
    return NextResponse.json(
      { error: 'This practice mode is not enabled for your account.', code: 'tier_required' },
      { status: 403 },
    );
  }

  // PLAN.md §8 Phase 7B: every read this turn needs, issued at once instead of one at a
  // time. On Neon these are HTTPS round trips (§3.1), so serializing five of them was
  // costing most of a second before the model had even seen the audio.
  const [underCap, pairRows, recurringErrorRows, statsSnapshot, ttsCharsUsed, taskConfig] =
    await Promise.all([
      isUnderDailyLessonAttemptCap(userId),
      db.select().from(languagePairs).where(eq(languagePairs.id, languagePairId)),
      db
        .select({ category: errorPatterns.category, description: errorPatterns.description })
        .from(errorPatterns)
        .where(and(eq(errorPatterns.userId, userId), eq(errorPatterns.languagePairId, languagePairId)))
        .orderBy(desc(errorPatterns.occurrenceCount), desc(errorPatterns.lastSeenAt))
        .limit(5),
      loadTurnStatsSnapshot({ userId, timezone: session.user.timezone }),
      getMonthlyTtsCharCount(),
      // Which model runs this turn is admin-configurable per task (PLAN.md §14.4).
      // A review drill is graded by the lesson-feedback model, same as a lesson turn.
      getProviderForTask(mode === 'live' ? 'live_conversation' : 'lesson_feedback'),
    ]);

  if (!underCap) {
    return NextResponse.json(
      { error: 'Daily practice limit reached - come back tomorrow!', code: 'daily_limit_reached' },
      { status: 429 },
    );
  }

  const [pair] = pairRows;
  if (!pair) {
    return NextResponse.json(
      { error: 'Unknown language pair', code: 'invalid_language_pair' },
      { status: 400 },
    );
  }

  // What the learner is being asked to do. A review drill and a numbered lesson
  // exercise are both assembled HERE, from the row in the database - the browser
  // sends an id, not the text. That keeps a listen_prompt's `audioText` out of the
  // client entirely (§3.4) and keeps the expected review answer authoritative (§13.4).
  let lessonContext = promptContext ?? FREE_PRACTICE_LESSON_CONTEXT;

  if (mode === 'review' && reviewItemId) {
    const item = await getReviewItemForUser(reviewItemId, userId);
    if (!item) {
      return NextResponse.json(
        { error: 'Review item not found', code: 'not_found' },
        { status: 404 },
      );
    }
    lessonContext = buildReviewPromptContext(item);
  } else if (lessonId && (exerciseIndex !== undefined || dialogueLineIndex !== undefined)) {
    const lesson = await getLessonForPair(lessonId, pair.id);
    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found', code: 'not_found' }, { status: 404 });
    }
    // A dialogue line is assembled here for the same reason an exercise is: the
    // browser sends an index, and the row in the database decides what the turn means.
    const builtContext =
      dialogueLineIndex !== undefined
        ? buildDialoguePromptContext(lesson.content, dialogueLineIndex)
        : buildExercisePromptContext(lesson.content, exerciseIndex as number);
    if (!builtContext) {
      return NextResponse.json(
        { error: 'Unknown exercise', code: 'invalid_exercise' },
        { status: 400 },
      );
    }
    lessonContext = builtContext;
  }

  const factLearning = session.user.factLearning;
  const systemPrompt =
    assembleSystemPrompt({
      pair,
      mode,
      level: session.user.level ?? 'A1',
      coachingProfile: session.user.coachingProfile,
      focusSkills: session.user.focusSkills,
      profileNotes: session.user.profileNotes,
      explanationLanguage: session.user.explanationLanguage,
      recurringErrors: recurringErrorRows,
      lessonContext,
    }) + (factLearning ? FACT_LEARNING_INSTRUCTION : '');

  const callArgs = {
    provider: taskConfig.provider,
    model: taskConfig.model,
    systemPrompt,
    userTurnContext: lessonContext,
    input,
  };

  // ---- The two model calls, in parallel (PLAN.md §8 Phase 7B item 1) ---------------
  //
  // The turn used to be: full structured call, THEN synthesis, THEN respond. Now the
  // reply-only call and the structured call run together, and synthesis is chained onto
  // whichever reply lands first - so the response leaves as soon as the SLOWER of
  // {structured feedback} and {short reply + TTS} is done, instead of their sum.
  //
  // The cost of the split, stated plainly: two requests per turn instead of one, which
  // roughly halves the free tier's daily-request headroom (§15.2 anticipates exactly
  // this - ~35 DAU on one call, ~18 on two). At two beta users that is 80 requests
  // against a 1,500/day cap, so it is free here and would need revisiting long before
  // it wasn't. Only spoken turns take the split: a typed answer (§13.4's quiet-room
  // fallback) is already fast and gains nothing worth a second request.
  const ttsVoice = pair.ttsVoice;
  const level = session.user.level;

  // The attempt is counted from here on, success or failure - §6.5's daily cap is the
  // guard against a runaway retry loop, and a loop of FAILING calls (each one up to
  // three provider requests) burns free-tier quota exactly like a succeeding one.
  // Failed turns write no utterance, so this can't inflate the gamification turn count.
  after(() => logUsage(userId, 'lesson_attempt'));

  // Speaking time, the metric that actually tracks fluency (ROADMAP.md P1.5b follow-on).
  // Logged beside the attempt rather than with the turn: like the attempt itself it is
  // spent whether or not the model call comes back, and `usage_log` is already
  // (kind, amount), so counting seconds needs no schema change.
  if (spokenSeconds !== undefined && spokenSeconds > 0) {
    after(() => logUsage(userId, 'speaking_seconds', spokenSeconds));
  }

  const earlyReplyPath: Promise<EarlyReply | null> =
    !noSpokenReply && input.kind === 'audio' && ttsVoice
      ? getQuickReply(callArgs).then(async (quick) => {
          if (!quick) return null;
          return { quick, audio: await synthesizeSpoken(quick, ttsVoice, ttsCharsUsed, level, userId) };
        })
      : Promise.resolve(null);

  let feedback: FeedbackResult;
  let early: EarlyReply | null;
  try {
    [feedback, early] = await Promise.all([getValidatedFeedback(callArgs), earlyReplyPath]);
  } catch (err) {
    // PLAN.md §6.4: the provider's own 429 is transient, and answering it with a 502
    // ("something went wrong, try again") is an invitation to retry immediately -
    // against the very quota that just ran out. It gets a 429 with a wait instead, so
    // the client's existing rate-limit copy and any retry back off by a real number.
    if (err instanceof ProviderRateLimitError) {
      console.warn('[lesson/attempt] provider rate limited', err.retryAfterSeconds);
      return NextResponse.json(
        {
          error: `The tutor is busy right now - try again in about ${err.retryAfterSeconds} seconds.`,
          code: 'provider_rate_limited',
          retryAfterSeconds: err.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(err.retryAfterSeconds) } },
      );
    }
    // Logged, not returned: the message can name the provider and model, which the
    // learner has no use for and shouldn't see.
    console.error('[lesson/attempt] feedback failed', err);
    return NextResponse.json(
      { error: "Couldn't analyze that recording - please try again.", code: 'feedback_failed' },
      { status: 502 },
    );
  }

  // The learner hears the quick reply, so that is the reply of record: it goes into the
  // response AND into the utterances row, so the spoken turn and the stored turn can
  // never disagree. The structured call still supplies transcription, errors and the
  // correction - the response contract to the client is byte-for-byte the shape it was.
  if (early?.quick) {
    feedback = {
      ...feedback,
      tutorReply: early.quick.tutorReply,
      followUpQuestion: early.quick.followUpQuestion,
    };
  }

  let tutorAudioBase64: string | null = early?.audio?.audioBase64 ?? null;

  // Serial fallback: no split path (typed answer / provider without a quick reply), or
  // the quick call failed. Same behaviour the route had before Phase 7B. Skipped
  // entirely for a caller that flagged noSpokenReply - synthesizing a reply nobody
  // plays would just spend TTS quota for nothing.
  if (!tutorAudioBase64 && ttsVoice && !noSpokenReply) {
    const synthesized = await synthesizeSpoken(feedback, ttsVoice, ttsCharsUsed, level, userId);
    if (synthesized) {
      tutorAudioBase64 = synthesized.audioBase64;
    }
  }

  const { result: gamification, nextState } = computeTurnStats({
    snapshot: statsSnapshot,
    hadZeroErrors: feedback.errors.length === 0,
  });

  // ---- Everything below the response line (PLAN.md §8 Phase 7B item 1) -------------
  // utterances, error_patterns, usage_log and user_stats all move into after(), so the
  // learner's audio starts playing while the writes are still going. The numbers in the
  // response were computed above from reads taken before the model call; the writes
  // below only make them durable.
  const persistedFeedback = feedback;
  // A fact the learner volunteered, stored only if they asked the tutor to remember
  // things (default off). Its own after() so a failure here cannot take the turn's
  // own writes down with it.
  if (factLearning && typeof persistedFeedback.learnedFact === 'string') {
    const fact = persistedFeedback.learnedFact;
    after(() => saveLearnedFact(userId, fact));
  }
  after(async () => {
    await persistTurn({
      userId,
      languagePairId: pair.id,
      mode,
      lessonId,
      feedback: persistedFeedback,
      gamificationState: nextState,
    });
  });

  return NextResponse.json({
    ...feedback,
    tutorAudioBase64,
    gamification,
  });
}

/**
 * PLAN.md §4.5: synthesize `tutorReply + ' ' + followUpQuestion` as one call, one quota
 * hit, one blob. PLAN.md §16 defect 2 / §6.12: Cloud TTS is in the BILLED project, so
 * past the free allotment it charges silently instead of erroring. Over the cap we skip
 * synthesis and return text-only feedback - the same non-fatal degradation §4.5 already
 * uses when TTS fails, so nothing downstream needs a new case.
 */
async function synthesizeSpoken(
  reply: { tutorReply: string; followUpQuestion: string },
  voice: string,
  ttsCharsUsedThisMonth: number,
  level: FeedbackVoiceLevel,
  userId: string,
): Promise<{ audioBase64: string; charCount: number } | null> {
  const spoken = `${reply.tutorReply} ${reply.followUpQuestion}`;
  if (!isUnderMonthlyTtsCharCapFor(ttsCharsUsedThisMonth, spoken.length)) {
    console.warn('[lesson/attempt] monthly TTS char cap reached - text-only feedback');
    return null;
  }
  const synthesized = await synthesizeTutorSpeech(spoken, voice, level);
  if (synthesized) {
    // Logged the moment Google billed us, NOT when the turn persists: the quick-reply
    // path synthesizes in parallel with the structured call, and a turn whose
    // structured call then fails never reaches persistTurn - the characters were
    // still spent, and the monthly stop reads this log.
    after(() => logUsage(userId, 'tts_chars', synthesized.charCount));
  }
  return synthesized;
}

type FeedbackVoiceLevel = Parameters<typeof synthesizeTutorSpeech>[2];

/** The spoken half of the turn, plus its audio, when the split path produced one. */
type EarlyReply = {
  quick: QuickReply;
  audio: { audioBase64: string; charCount: number } | null;
};
