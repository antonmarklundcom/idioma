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
  if (!apiKey || !voiceName) return null;

  const speakingRate = speakingRateFor(level);

  try {
    // The key goes in a HEADER, never in the query string: URLs are the part of a
    // request that gets logged, proxied, and pasted into a bug report, and this key
    // belongs to the BILLED project (§6.12). `X-Goog-Api-Key` is Google's documented
    // equivalent of `?key=` and costs nothing to prefer.
    const res = await fetch(
      'https://texttospeech.googleapis.com/v1/text:synthesize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: voiceName.split('-').slice(0, 2).join('-'), name: voiceName },
          audioConfig: { audioEncoding: 'MP3', speakingRate },
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) return null;
    return { audioBase64: data.audioContent, charCount: text.length };
  } catch {
    return null;
  }
}
