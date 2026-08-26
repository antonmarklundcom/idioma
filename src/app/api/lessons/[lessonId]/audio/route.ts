import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { languagePairs } from '@/lib/db/schema';
import {
  getDialogueAudioText,
  getExercisePromptAudioText,
  getLessonForPair,
  getListenAudioText,
  getVocabAudioText,
} from '@/lib/lessons';
import { speakingRateFor, synthesizeTutorSpeech } from '@/lib/tts';
import {
  getCachedListenAudio,
  listenAudioKey,
  setCachedListenAudio,
} from '@/lib/listenAudioCache';
import { getStoredLessonAudio, putStoredLessonAudio } from '@/lib/lessonAudioStore';
import { isUnderMonthlyTtsCharCap, logUsage } from '@/lib/usage';

/**
 * Audio for one `listen_prompt` exercise (PLAN.md §3.4, Phase 5B) or one vocab item
 * of the lesson's vocab step (ROADMAP.md P1.5).
 *
 * The browser asks for an item by index - `?exercise=N` or `?vocab=N` - and the text
 * being synthesized is read from the lesson row here. That is what keeps `audioText`
 * off the client (it is played, never displayed) and keeps TTS server-side-only, so
 * the quota can't be driven by client-supplied text (§2). A vocab term is not secret,
 * but it goes through the same door so there is only one way to spend characters.
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

  const searchParams = new URL(request.url).searchParams;
  const vocabParam = searchParams.get('vocab');
  const dialogueParam = searchParams.get('dialogue');
  const promptParam = searchParams.get('prompt');
  const exerciseParam = searchParams.get('exercise');
  const slot: 'exercise' | 'vocab' | 'dialogue' | 'prompt' =
    vocabParam !== null
      ? 'vocab'
      : dialogueParam !== null
        ? 'dialogue'
        : promptParam !== null
          ? 'prompt'
          : 'exercise';
  const indexParam =
    slot === 'vocab'
      ? vocabParam
      : slot === 'dialogue'
        ? dialogueParam
        : slot === 'prompt'
          ? promptParam
          : exerciseParam;
  const index = Number(indexParam);
  if (!indexParam || !Number.isInteger(index) || index < 0) {
    return NextResponse.json(
      { error: 'Invalid item index', code: 'validation_error' },
      { status: 400 },
    );
  }

  const { lessonId } = await params;
  const lesson = await getLessonForPair(lessonId, session.user.languagePairId);
  if (!lesson) {
    return NextResponse.json({ error: 'Lesson not found', code: 'not_found' }, { status: 404 });
  }

  const audioText =
    slot === 'vocab'
      ? getVocabAudioText(lesson.content, index)
      : slot === 'dialogue'
        ? getDialogueAudioText(lesson.content, index)
        : slot === 'prompt'
          ? getExercisePromptAudioText(lesson.content, index)
          : getListenAudioText(lesson.content, index);
  if (!audioText) {
    return NextResponse.json(
      { error: 'No audio for that item', code: 'not_found' },
      { status: 404 },
    );
  }

  const [pair] = await db
    .select({ ttsVoice: languagePairs.ttsVoice, nativeVoice: languagePairs.nativeVoice })
    .from(languagePairs)
    .where(eq(languagePairs.id, session.user.languagePairId));
  // The prompt slot narrates in the learner's NATIVE voice; every other slot narrates
  // the TARGET language, same as before this feature existed.
  const voice = slot === 'prompt' ? pair?.nativeVoice : pair?.ttsVoice;
  if (!voice) {
    // A pair with no configured voice (a future Guaraní pair, §3.3) simply can't
    // run listening exercises - the player degrades instead of breaking.
    return NextResponse.json(
      { error: 'Listening audio is unavailable for this language', code: 'tts_unavailable' },
      { status: 409 },
    );
  }

  // A listening prompt - and even more so a vocab chip, which is TAPPED repeatedly -
  // is static content, so the same
  // bytes were being re-synthesized - and re-billed - every time (§6.12). A cache hit
  // spends no characters, so it also logs none and is not subject to the monthly stop
  // below: nothing was bought this time.
  const cacheKey = listenAudioKey({
    lessonId,
    exerciseIndex: index,
    slot,
    voice,
    speakingRate: speakingRateFor(session.user.level),
    audioText,
  });
  const cached = getCachedListenAudio(cacheKey);
  if (cached) {
    return NextResponse.json({ audioBase64: cached.audioBase64 });
  }

  // The durable library (`npm run audio:generate`). Static lesson audio is immutable
  // content, so once a phrase has been synthesized it should never be bought again -
  // and unlike the map above, this survives the restart that a serverless platform
  // performs constantly. A hit here spends no characters and logs none.
  const stored = await getStoredLessonAudio(cacheKey);
  if (stored) {
    setCachedListenAudio(cacheKey, stored);
    return NextResponse.json({ audioBase64: stored.audioBase64 });
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

  const tts = await synthesizeTutorSpeech(audioText, voice, session.user.level);
  if (!tts) {
    return NextResponse.json(
      { error: "Couldn't load the audio - please try again.", code: 'tts_failed' },
      { status: 502 },
    );
  }
  await logUsage(session.user.id, 'tts_chars', tts.charCount);
  setCachedListenAudio(cacheKey, tts);
  // Bought once, kept forever. Written after the spend is logged and before the
  // response, so a phrase the generator has not reached yet still only costs once.
  await putStoredLessonAudio({
    cacheKey,
    lessonId,
    audioBase64: tts.audioBase64,
    charCount: tts.charCount,
  });

  return NextResponse.json({ audioBase64: tts.audioBase64 });
}
