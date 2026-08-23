import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { languagePairs } from '@/lib/db/schema';
import { synthesizeTutorSpeech } from '@/lib/tts';
import { phraseFor, ttsCheckReason, type TtsCheckResult } from '@/lib/ttsCheck';
import { logUsage } from '@/lib/usage';

// A real call to Google, so it can take a second or two per pair.
export const maxDuration = 60;

/**
 * "Why is the app silent?" answered in one click (owner-only).
 *
 * Voice failures are the hardest thing in this app to diagnose from the outside: a
 * missing key, a pair with no voice configured, a voice name Google rejects and a
 * disabled API all present to the learner as the same thing - a speaker icon that
 * does nothing. The runtime log distinguishes them, but reading it means finding the
 * deployment, opening the log, and knowing what to search for.
 *
 * This tries each pair's own configured voice on a short phrase and reports which
 * one of those cases it is - and hands back the audio, so the owner can hear the
 * voice their family will be listening to rather than trusting a green tick.
 */

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only', code: 'forbidden' }, { status: 403 });
  }

  // Presence only. The key itself is never returned, logged, or hinted at - knowing
  // WHETHER it is set is the whole diagnostic value, and is not a secret.
  const keyConfigured = Boolean(process.env.GOOGLE_TTS_API_KEY);

  const pairs = await db
    .select({
      code: languagePairs.code,
      displayName: languagePairs.displayName,
      ttsVoice: languagePairs.ttsVoice,
    })
    .from(languagePairs)
    .where(eq(languagePairs.active, true));

  const results: TtsCheckResult[] = [];
  for (const pair of pairs) {
    // Only actually call Google when a call could succeed - a pair with no voice, or
    // a deployment with no key, is already answered without spending anything.
    const worthTrying = Boolean(pair.ttsVoice) && keyConfigured;
    const spoken = worthTrying
      ? await synthesizeTutorSpeech(phraseFor(pair.ttsVoice!), pair.ttsVoice!, session.user.level)
      : null;
    if (spoken) {
      // Metered like any other synthesis: a test that spends characters invisibly
      // would be a small hole in the one number that guards the monthly allowance.
      await logUsage(session.user.id, 'tts_chars', spoken.charCount);
    }
    results.push({
      code: pair.code,
      displayName: pair.displayName,
      voice: pair.ttsVoice,
      ok: spoken !== null,
      // Google's own complaint is in the runtime log (see lib/tts.ts); what the owner
      // needs here is which of the four situations they are in.
      reason: ttsCheckReason({
        keyConfigured,
        voice: pair.ttsVoice,
        synthesized: spoken !== null,
      }),
      audioBase64: spoken?.audioBase64 ?? null,
    });
  }

  return NextResponse.json({ keyConfigured, results });
}
