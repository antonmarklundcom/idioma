import type { CefrLevel } from '@/lib/db/schema';

/**
 * Beginners hear the tutor slower (PLAN.md §4.5). Exported because it is part of what
 * makes two syntheses of the same sentence different bytes, so anything caching that
 * audio has to key on it (src/lib/listenAudioCache.ts).
 */
export function speakingRateFor(level?: CefrLevel | null): number {
  return level === 'A1' || level === 'A2' ? 0.85 : 0.95;
}

// Google Cloud TTS Neural2 (PLAN.md §4.5). Called ONLY server-side, only on
// model-generated text, never on client-supplied text. Never fatal: any failure
// returns null and the caller falls back to text-only feedback.
export async function synthesizeTutorSpeech(
  text: string,
  voiceName: string,
  level?: CefrLevel | null,
): Promise<{ audioBase64: string; charCount: number } | null> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    warnOnce('no-key', 'GOOGLE_TTS_API_KEY is not set - the tutor will reply in text only.');
    return null;
  }
  if (!voiceName) {
    warnOnce('no-voice', 'This language pair has no tts_voice - the tutor will reply in text only.');
    return null;
  }

  const languageCode = voiceName.split('-').slice(0, 2).join('-');
  const speakingRate = speakingRateFor(level);

  // The named voice first; then the same language with no name at all. The seeded
  // voice names are documented in scripts/seedPairs.ts as unverified guesses, and a
  // name Google doesn't recognize used to mean silence forever. Falling back to
  // "any voice in this language" means a wrong name costs you the specific voice,
  // not the feature.
  const named = await callGoogle(apiKey, { languageCode, name: voiceName }, text, speakingRate);
  if (named) return named;

  const fallback = await callGoogle(apiKey, { languageCode }, text, speakingRate);
  if (fallback) {
    warnOnce(
      `fallback-${voiceName}`,
      `voice "${voiceName}" was rejected; used Google's default ${languageCode} voice instead. ` +
        'Fix the pair\'s tts_voice to silence this.',
    );
  }
  return fallback;
}

async function callGoogle(
  apiKey: string,
  voice: { languageCode: string; name?: string },
  text: string,
  speakingRate: number,
): Promise<{ audioBase64: string; charCount: number } | null> {
  try {
    // The key goes in a HEADER, never in the query string: URLs are the part of a
    // request that gets logged, proxied, and pasted into a bug report, and this key
    // belongs to the BILLED project (§6.12). `X-Goog-Api-Key` is Google's documented
    // equivalent of `?key=` and costs nothing to prefer.
    const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
      body: JSON.stringify({
        input: { text },
        voice,
        audioConfig: { audioEncoding: 'MP3', speakingRate },
      }),
    });
    if (!res.ok) {
      // Why this is logged at all: a silent null here presents to the learner as
      // "the app has no voice", with nothing anywhere saying why. The body carries
      // Google's actual complaint (bad key, API not enabled, unknown voice); it is
      // truncated because it is unbounded and this lands in a shared build log.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      console.warn(`[tts] ${res.status} for voice ${voice.name ?? voice.languageCode}: ${detail}`);
      return null;
    }
    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) {
      console.warn('[tts] response carried no audioContent');
      return null;
    }
    return { audioBase64: data.audioContent, charCount: text.length };
  } catch (error) {
    console.warn('[tts] request failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

// One line per distinct problem per server instance. A per-turn warning would bury
// the log for a condition that is constant until someone changes an env var.
const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[tts] ${message}`);
}
