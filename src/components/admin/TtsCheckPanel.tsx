'use client';

import { useRef, useState } from 'react';

import type { TtsCheckReason, TtsCheckResult } from '@/lib/ttsCheck';

type Response = { keyConfigured: boolean; storedRecordings: number; results: TtsCheckResult[] };

// What each outcome MEANS, and what to do about it. The point of this panel is that
// nobody should have to read a runtime log to tell these four apart.
const EXPLANATION: Record<TtsCheckReason, string> = {
  ok: 'Working — press play to hear it.',
  no_api_key:
    'GOOGLE_TTS_API_KEY is not set on this deployment. Add it in Vercel (Production) and redeploy.',
  no_voice_configured:
    'This language pair has no tts_voice set, so it is text-only by design. Set one on the pair to give it a voice.',
  google_refused:
    'The key is set but Google refused the request. Usually: the Cloud Text-to-Speech API is not enabled on the project, the key is restricted to a different API, billing is not linked, or the voice name does not exist. The runtime log has Google\'s exact words on a [tts] line.',
};

export function TtsCheckPanel() {
  const [state, setState] = useState<'idle' | 'running'>('idle');
  const [data, setData] = useState<Response | null>(null);
  const [failed, setFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function run() {
    setState('running');
    setFailed(false);
    try {
      const res = await fetch('/api/admin/tts/test', { method: 'POST' });
      if (!res.ok) throw new Error('request_failed');
      setData((await res.json()) as Response);
    } catch {
      setFailed(true);
    } finally {
      setState('idle');
    }
  }

  function play(audioBase64: string) {
    const audio = (audioRef.current ??= new Audio());
    audio.src = `data:audio/mpeg;base64,${audioBase64}`;
    audio.play().catch(() => {});
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">The tutor&apos;s voice</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Speaks one short phrase per language pair, using that pair&apos;s own configured voice.
          Costs a few dozen characters of the monthly allowance, and they are metered like any
          other synthesis.
        </p>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={state === 'running'}
        className="self-start rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
      >
        {state === 'running' ? 'Testing…' : 'Test the voice'}
      </button>

      {failed && (
        <p className="text-sm text-red-600 dark:text-red-400">
          The test itself could not run. Check you are still signed in as an admin.
        </p>
      )}

      {data && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {data.keyConfigured
              ? '✅ GOOGLE_TTS_API_KEY is set on this deployment.'
              : '❌ GOOGLE_TTS_API_KEY is NOT set on this deployment — nothing can speak until it is.'}
          </p>

          <p className="text-sm text-slate-700 dark:text-slate-300">
            {data.storedRecordings > 0
              ? `🎧 ${data.storedRecordings} recordings stored — those cost nothing to play.`
              : '🎧 No recordings stored yet. Run `npm run audio:generate` to record the whole lesson library once, instead of paying for every tap.'}
          </p>

          {data.results.map((result) => (
            <div
              key={result.code}
              className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900 dark:text-white">
                  {result.ok ? '✅' : '❌'} {result.displayName}
                </p>
                <p className="font-mono text-xs text-slate-400">{result.voice ?? 'no voice'}</p>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {EXPLANATION[result.reason]}
              </p>
              {result.audioBase64 && (
                <button
                  type="button"
                  onClick={() => play(result.audioBase64!)}
                  className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  🔊 Play it
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
