import type { CefrLevel } from '@/lib/db/schema';

/**
 * The admin voice check (/api/admin/tts/test): what each language pair should be heard
 * saying, and what a failure means.
 *
 * Separate from the route so the phrase choice can be tested without a database, a key,
 * or a call to Google - the three things that make the route itself untestable offline.
 */

/** Short on purpose: the check spends real characters from the monthly allowance. */
const TEST_PHRASES: Record<string, string> = {
  es: 'Hola, ¿cómo andás? Vamos a practicar un poco.',
  en: 'Hello! Let us practise a little today.',
  sv: 'Hej! Nu övar vi en stund.',
};

/**
 * The phrase for a voice, chosen by the voice's own language prefix ('es-US-Neural2-A'
 * → Spanish). English is the fallback rather than silence: hearing the wrong language
 * still proves the key, the API and the voice all work, which is what the check is for.
 */
export function phraseFor(voiceName: string): string {
  return TEST_PHRASES[voiceName.slice(0, 2).toLowerCase()] ?? TEST_PHRASES.en;
}

/** Which of the four situations the owner is in - the whole point of the check. */
export type TtsCheckReason = 'ok' | 'no_api_key' | 'no_voice_configured' | 'google_refused';

export type TtsCheckResult = {
  code: string;
  displayName: string;
  voice: string | null;
  ok: boolean;
  reason: TtsCheckReason;
  audioBase64: string | null;
};

/**
 * Decides the outcome for one pair from the three facts that determine it. Pure, so the
 * precedence is pinned down by tests: a pair with no voice is text-only BY DESIGN and
 * must not be reported as a missing key, even when the key is also missing - telling
 * the owner to go and set an environment variable that would change nothing for that
 * pair is worse than saying nothing.
 */
export function ttsCheckReason(args: {
  keyConfigured: boolean;
  voice: string | null;
  synthesized: boolean;
}): TtsCheckReason {
  if (!args.voice) return 'no_voice_configured';
  if (!args.keyConfigured) return 'no_api_key';
  return args.synthesized ? 'ok' : 'google_refused';
}

export type TtsCheckLevel = CefrLevel | null | undefined;
