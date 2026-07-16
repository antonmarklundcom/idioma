import type { CefrLevel } from '@/lib/db/schema';

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

  const speakingRate = level === 'A1' || level === 'A2' ? 0.85 : 0.95;

  try {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
