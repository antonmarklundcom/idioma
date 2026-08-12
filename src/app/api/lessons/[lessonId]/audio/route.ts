import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { languagePairs } from '@/lib/db/schema';
import { getLessonForPair, getListenAudioText } from '@/lib/lessons';
import { synthesizeTutorSpeech } from '@/lib/tts';
import { isUnderMonthlyTtsCharCap, logUsage } from '@/lib/usage';

/**
 * Audio for one `listen_prompt` exercise (PLAN.md §3.4, Phase 5B).
 *
 * The browser asks for an exercise by index; the text being synthesized is read
 * from the lesson row here. That is what keeps `audioText` off the client (it is
 * played, never displayed) and keeps TTS server-side-only, so the quota can't be
 * driven by client-supplied text (§2).
 */
export async function GET(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
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

  const exerciseParam = new URL(request.url).searchParams.get('exercise');
  const exerciseIndex = Number(exerciseParam);
  if (!exerciseParam || !Number.isInteger(exerciseIndex) || exerciseIndex < 0) {
    return NextResponse.json(
      { error: 'Invalid exercise index', code: 'validation_error' },
      { status: 400 },
    );
  }

  const { lessonId } = await params;
  const lesson = await getLessonForPair(lessonId, session.user.languagePairId);
  if (!lesson) {
    return NextResponse.json({ error: 'Lesson not found', code: 'not_found' }, { status: 404 });
  }

  const audioText = getListenAudioText(lesson.content, exerciseIndex);
  if (!audioText) {
    return NextResponse.json(
      { error: 'No listening audio for that exercise', code: 'not_found' },
      { status: 404 },
    );
  }

  const [pair] = await db
    .select({ ttsVoice: languagePairs.ttsVoice })
    .from(languagePairs)
    .where(eq(languagePairs.id, session.user.languagePairId));
  if (!pair?.ttsVoice) {
    // A pair with no configured voice (a future Guaraní pair, §3.3) simply can't
    // run listening exercises - the player degrades instead of breaking.
    return NextResponse.json(
      { error: 'Listening audio is unavailable for this language', code: 'tts_unavailable' },
      { status: 409 },
    );
  }

  // §16 defect 2 / §6.12: this is the second place in the app that spends TTS
  // characters, so it observes the same monthly stop point. Unlike tutor feedback
  // there is no text-only degradation here - a listening exercise with no audio is
  // not an exercise - so it says so instead of silently going quiet.
  if (!(await isUnderMonthlyTtsCharCap(audioText.length))) {
    console.warn('[lessons/audio] monthly TTS char cap reached - refusing synthesis');
    return NextResponse.json(
      { error: 'Listening audio is paused for this month.', code: 'tts_cap_reached' },
      { status: 429 },
    );
  }

  const tts = await synthesizeTutorSpeech(audioText, pair.ttsVoice, session.user.level);
  if (!tts) {
    return NextResponse.json(
      { error: "Couldn't load the audio - please try again.", code: 'tts_failed' },
      { status: 502 },
    );
  }
  await logUsage(session.user.id, 'tts_chars', tts.charCount);

  return NextResponse.json({ audioBase64: tts.audioBase64 });
}
