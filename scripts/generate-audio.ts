/**
 * Pre-generate the lesson audio library.
 *
 * Every vocabulary word, dialogue line and listening prompt in the database is
 * synthesized once and stored in `lesson_audio`, so tapping a word is a database read
 * rather than a paid round trip to Google. The library is ~900 recordings across 84
 * lessons - about 25,000 characters, or 2.5% of one month's free allowance - and once
 * it exists the only thing that ever spends characters again is the tutor speaking its
 * own replies, which are new text every time and can never be pre-generated.
 *
 * Run:  npm run audio:generate            (everything missing)
 *       npm run audio:generate -- --dry   (what it would do, spending nothing)
 *
 * Safe to re-run: it skips what is already stored, so an interrupted run is resumed by
 * running it again. Needs DATABASE_URL and GOOGLE_TTS_API_KEY.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { languagePairs, lessonContent } from '../src/lib/db/schema';
import { lessonAudioItems } from '../src/lib/lessons';
import { listenAudioKey } from '../src/lib/listenAudioCache';
import { getStoredLessonAudio, putStoredLessonAudio } from '../src/lib/lessonAudioStore';
import { speakingRateFor, synthesizeTutorSpeech } from '../src/lib/tts';
import type { CefrLevel } from '../src/lib/db/schema';

/**
 * Beginners hear a slower voice (§4.5), so the same phrase exists at two speeds and
 * the key includes the rate. Both are generated: which one a learner gets depends on
 * their level, and a lesson should not be silent for whoever opens it first.
 */
const LEVELS_TO_COVER: CefrLevel[] = ['A1', 'B1'];

const dryRun = process.argv.includes('--dry');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!dryRun && !process.env.GOOGLE_TTS_API_KEY) {
    throw new Error('GOOGLE_TTS_API_KEY is not set - nothing could be synthesized');
  }

  const lessons = await db
    .select({
      id: lessonContent.id,
      title: lessonContent.title,
      content: lessonContent.content,
      pairCode: languagePairs.code,
      voice: languagePairs.ttsVoice,
    })
    .from(lessonContent)
    .innerJoin(languagePairs, eq(languagePairs.id, lessonContent.languagePairId));

  let existing = 0;
  let generated = 0;
  let failed = 0;
  let charsSpent = 0;
  let skippedNoVoice = 0;

  for (const lesson of lessons) {
    if (!lesson.voice) {
      skippedNoVoice += 1;
      continue;
    }
    const items = lessonAudioItems(lesson.content);

    for (const item of items) {
      for (const level of LEVELS_TO_COVER) {
        const speakingRate = speakingRateFor(level);
        const cacheKey = listenAudioKey({
          lessonId: lesson.id,
          exerciseIndex: item.index,
          slot: item.slot,
          voice: lesson.voice,
          speakingRate,
          audioText: item.text,
        });

        if (await getStoredLessonAudio(cacheKey)) {
          existing += 1;
          continue;
        }
        if (dryRun) {
          generated += 1;
          charsSpent += item.text.length;
          continue;
        }

        const spoken = await synthesizeTutorSpeech(item.text, lesson.voice, level);
        if (!spoken) {
          // Reported rather than thrown: one voice Google dislikes should not cost the
          // other 900 recordings, and re-running picks up whatever is still missing.
          failed += 1;
          console.warn(`  ✗ ${lesson.pairCode} "${lesson.title}" ${item.slot}[${item.index}]`);
          continue;
        }
        await putStoredLessonAudio({
          cacheKey,
          lessonId: lesson.id,
          audioBase64: spoken.audioBase64,
          charCount: spoken.charCount,
        });
        generated += 1;
        charsSpent += spoken.charCount;
      }
    }
  }

  const label = dryRun ? 'would generate' : 'generated';
  console.log(
    `\n${lessons.length} lessons · ${existing} already stored · ${label} ${generated}` +
      `${failed ? ` · ${failed} FAILED` : ''}` +
      `${skippedNoVoice ? ` · ${skippedNoVoice} lessons skipped (pair has no voice)` : ''}`,
  );
  console.log(
    `${charsSpent.toLocaleString()} characters ${dryRun ? 'would be' : ''} spent ` +
      `(${((charsSpent / 1_000_000) * 100).toFixed(2)}% of a month's free allowance)`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
