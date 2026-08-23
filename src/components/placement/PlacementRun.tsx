'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UtteranceRecorder } from '@/components/recorder/UtteranceRecorder';
import { blobToBase64 } from '@/components/recorder/blobToBase64';
import { fetchJson, type ApiErrorKind } from '@/lib/apiError';
import {
  PLACEMENT_LEVELS,
  shouldStopEarly,
  suggestLevelFrom,
  type PlacementAnswer,
  type PlacementTask,
} from '@/lib/placement';
import type { CefrLevel } from '@/lib/db/schema';
import type { LessonAttemptResponse } from '@/types';
import { t, type Locale } from '@/lib/i18n';

/**
 * Four to six spoken tasks of rising difficulty, then a level the app SUGGESTS and the
 * learner confirms (ROADMAP.md P1.5b follow-on item 4).
 *
 * Deliberately not a lesson: no corrections are shown between tasks. Being marked up
 * on task two changes how task three is answered, and the learner came here for a
 * starting point rather than for feedback - which every lesson after this gives them.
 */
export function PlacementRun({
  tasks,
  currentLevel,
  locale,
}: {
  tasks: PlacementTask[];
  currentLevel: CefrLevel | null;
  locale: Locale;
}) {
  const strings = t(locale).placement;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [status, setStatus] = useState<'idle' | 'sending' | 'saving' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [chosen, setChosen] = useState<CefrLevel | null>(null);

  const task = tasks[step];

  const messageForError = useCallback(
    (kind: ApiErrorKind, fallback: string) => {
      if (kind === 'rate_limited') return strings.rateLimited;
      if (kind === 'timeout') return strings.timedOut;
      if (kind === 'network') return strings.networkError;
      return fallback;
    },
    [strings],
  );

  const handleRecorded = useCallback(
    async (blob: Blob, mimeType: string, spokenSeconds: number) => {
      if (!task) return;
      setStatus('sending');
      setErrorMessage(null);

      let audioBase64: string;
      try {
        audioBase64 = await blobToBase64(blob);
      } catch {
        setErrorMessage(strings.couldntAnalyze);
        setStatus('error');
        return;
      }

      // The same route every graded turn goes through, with the same server-assembled
      // prompt context: a placement task is an ordinary exercise attempt.
      const result = await fetchJson<LessonAttemptResponse>('/api/lesson/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType,
          spokenSeconds,
          lessonId: task.lessonId,
          exerciseIndex: task.exerciseIndex,
        }),
      });
      if (!result.ok) {
        setErrorMessage(messageForError(result.kind, result.message ?? strings.couldntAnalyze));
        setStatus('error');
        return;
      }

      const answered: PlacementAnswer[] = [
        ...answers,
        { level: task.level, severities: result.data.errors.map((e) => e.severity) },
      ];
      setAnswers(answered);
      setStatus('idle');
      if (step + 1 >= tasks.length || shouldStopEarly(answered)) {
        setDone(true);
        return;
      }
      setStep(step + 1);
    },
    [task, answers, step, tasks.length, strings, messageForError],
  );

  const confirm = useCallback(
    async (level: CefrLevel) => {
      setStatus('saving');
      setErrorMessage(null);
      const result = await fetchJson<{ preferences: unknown }>('/api/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      });
      if (!result.ok) {
        setErrorMessage(messageForError(result.kind, result.message ?? strings.couldntSave));
        setStatus('error');
        return;
      }
      router.push('/today');
      router.refresh();
    },
    [router, strings, messageForError],
  );

  if (done) {
    const suggested = suggestLevelFrom(answers);
    const picked = chosen ?? suggested;
    return (
      <div className="flex w-full max-w-lg flex-1 flex-col items-center gap-5 py-8">
        <p className="text-sm font-semibold text-ink-muted">{strings.resultKicker}</p>
        <p className="text-5xl font-extrabold text-ink">{picked}</p>
        <p className="max-w-sm text-center text-sm text-ink-muted">
          {strings.resultExplanation(answers.length)}
        </p>

        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
            {strings.adjust}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {PLACEMENT_LEVELS.map((level) => (
              <button
                type="button"
                key={level}
                onClick={() => setChosen(level)}
                className={`chip ${picked === level ? 'chip-active' : ''}`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {errorMessage && (
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{errorMessage}</p>
        )}

        <button
          type="button"
          onClick={() => confirm(picked)}
          disabled={status === 'saving'}
          className="btn-primary"
        >
          {status === 'saving' ? strings.saving : strings.startHere(picked)}
        </button>
      </div>
    );
  }

  if (!task) return null;

  return (
    <div className="flex w-full max-w-lg flex-1 flex-col items-center gap-6 py-8">
      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
          {strings.taskOf(step + 1, tasks.length)}
        </p>
        {/* A bar rather than a count of what is left: the run can end early, so
            promising six tasks and stopping at four would read as a fault. */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full bg-brand-500 transition-[width]"
            style={{ width: `${(step / tasks.length) * 100}%` }}
          />
        </div>
      </div>

      <p className="max-w-lg text-center text-xl font-semibold text-balance text-ink">
        {task.prompt}
      </p>

      <UtteranceRecorder
        onRecorded={handleRecorded}
        disabled={status === 'sending'}
        sending={status === 'sending'}
        locale={locale}
      />

      {status === 'sending' && (
        <p className="text-sm text-ink-muted" aria-live="polite">
          {strings.listening}
        </p>
      )}
      {errorMessage && (
        <p className="text-sm font-semibold text-brand-700 dark:text-brand-300" aria-live="polite">
          {errorMessage}
        </p>
      )}

      <Link href="/today" className="text-sm font-bold text-ink-muted">
        {currentLevel ? strings.skipKeeping(currentLevel) : strings.skip}
      </Link>
    </div>
  );
}
