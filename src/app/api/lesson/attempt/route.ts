import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { errorPatterns, languagePairs, utterances } from '@/lib/db/schema';
import {
  feedbackResultSchema,
  lessonAttemptRequestSchema,
  type FeedbackResult,
} from '@/lib/zodSchemas';
import { getProvider } from '@/lib/llm/provider';
import { assembleSystemPrompt, FREE_PRACTICE_LESSON_CONTEXT } from '@/lib/gemini/prompts';
import { synthesizeTutorSpeech } from '@/lib/tts';
import { isUnderDailyLessonAttemptCap, isUnderMonthlyTtsCharCap, logUsage } from '@/lib/usage';
import { recordErrorPatterns } from '@/lib/errorPatterns';
import { recordTurnAndUpdateStats } from '@/lib/gamification';
import { getOrCreateSession } from '@/lib/practiceSessions';
import { capabilitiesFor } from '@/lib/tiers';

// Gemini audio calls can take 5-20s; Vercel Hobby's default is 10s but allows up to 60
// (PLAN.md §6.1).
export const maxDuration = 60;

async function getValidatedFeedback(args: {
  systemPrompt: string;
  userTurnContext: string;
  audioBase64: string;
  mimeType: string;
}): Promise<FeedbackResult> {
  const provider = getProvider();
  // PLAN.md §4.1: Zod-parse before trusting model output; retry once on mismatch.
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.getFeedback({
      systemPrompt: args.systemPrompt,
      userTurnContext: args.userTurnContext,
      input: { kind: 'audio', base64: args.audioBase64, mimeType: args.mimeType },
    });
    const parsed = feedbackResultSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  throw new Error('invalid_model_output');
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

  const body = await request.json().catch(() => null);
  const parsedBody = lessonAttemptRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'validation_error', details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }
  const { audioBase64, mimeType, lessonId, promptContext, mode } = parsedBody.data;

  // §15.3: capabilities come from the user's tier, resolved server-side.
  const capabilities = capabilitiesFor(session.user.tier);

  const underCap = await isUnderDailyLessonAttemptCap(
    session.user.id,
    capabilities.dailyAttemptCap,
  );
  if (!underCap) {
    return NextResponse.json(
      { error: 'Daily practice limit reached - come back tomorrow!', code: 'daily_limit_reached' },
      { status: 429 },
    );
  }

  const [pair] = await db
    .select()
    .from(languagePairs)
    .where(eq(languagePairs.id, session.user.languagePairId));
  if (!pair) {
    return NextResponse.json(
      { error: 'Unknown language pair', code: 'invalid_language_pair' },
      { status: 400 },
    );
  }

  const recurringErrorRows = await db
    .select({ category: errorPatterns.category, description: errorPatterns.description })
    .from(errorPatterns)
    .where(and(eq(errorPatterns.userId, session.user.id), eq(errorPatterns.languagePairId, pair.id)))
    .orderBy(desc(errorPatterns.occurrenceCount), desc(errorPatterns.lastSeenAt))
    .limit(5);

  const lessonContext = promptContext ?? FREE_PRACTICE_LESSON_CONTEXT;
  const systemPrompt = assembleSystemPrompt({
    pair,
    mode,
    level: session.user.level ?? 'A1',
    coachingProfile: session.user.coachingProfile,
    recurringErrors: recurringErrorRows,
    lessonContext,
  });

  let feedback: FeedbackResult;
  try {
    feedback = await getValidatedFeedback({
      systemPrompt,
      userTurnContext: lessonContext,
      audioBase64,
      mimeType,
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't analyze that recording - please try again.", code: 'feedback_failed' },
      { status: 502 },
    );
  }

  // §16 defect 2: Cloud TTS lives in the BILLED project, so it fails open - past
  // the free allotment it charges instead of 429ing. Check the project-wide
  // monthly total before synthesizing; over the cap we fall back to the text-only
  // path that already exists for a missing key or a NULL voice (§4.5).
  let tutorAudioBase64: string | null = null;
  if (pair.ttsVoice && (await isUnderMonthlyTtsCharCap())) {
    const spoken = `${feedback.tutorReply} ${feedback.followUpQuestion}`;
    const tts = await synthesizeTutorSpeech(spoken, pair.ttsVoice, session.user.level);
    if (tts) {
      tutorAudioBase64 = tts.audioBase64;
      await logUsage(session.user.id, 'tts_chars', tts.charCount);
    }
  }

  const sessionId = await getOrCreateSession({
    userId: session.user.id,
    languagePairId: pair.id,
    mode,
    lessonId,
  });

  await db.insert(utterances).values({
    sessionId,
    userId: session.user.id,
    speaker: 'user',
    transcript: feedback.transcription,
    corrected: feedback.correctedUtterance,
    tutorReply: feedback.tutorReply,
    followUpQuestion: feedback.followUpQuestion,
    errors: feedback.errors,
  });

  if (feedback.errors.length > 0) {
    await recordErrorPatterns({
      userId: session.user.id,
      languagePairId: pair.id,
      errors: feedback.errors,
    });
  }

  await logUsage(session.user.id, 'lesson_attempt');

  // PLAN.md §2 step ⑦ / §12: XP + timezone-aware streak/daily-goal update.
  const gamification = await recordTurnAndUpdateStats({
    userId: session.user.id,
    timezone: session.user.timezone,
    hadZeroErrors: feedback.errors.length === 0,
  });

  return NextResponse.json({
    ...feedback,
    tutorAudioBase64,
    gamification,
  });
}
