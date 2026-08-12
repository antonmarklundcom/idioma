'use client';

import { useState } from 'react';
import type { FeedbackResult } from '@/lib/zodSchemas';
import type { CoachingProfile } from '@/lib/db/schema';
import { t, type Locale } from '@/lib/i18n';

const SEVERITY_STYLES: Record<string, string> = {
  minor:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200',
  moderate:
    'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200',
  major:
    'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200',
};

// PLAN.md §11.4: one component, profile-aware rendering - never forked. confidence_first
// leads with the tutor's reply (already praise-first by prompt design, §11.3) and
// collapses the error list; accuracy_focus expands it by default.
export function FeedbackCard({
  feedback,
  tutorAudioBase64,
  coachingProfile,
  onReplay,
  locale,
}: {
  feedback: FeedbackResult;
  tutorAudioBase64: string | null;
  coachingProfile: CoachingProfile | null;
  onReplay: () => void;
  locale: Locale;
}) {
  const strings = t(locale).feedbackCard;
  const isAccuracyFocus = coachingProfile === 'accuracy_focus';
  const [errorsExpanded, setErrorsExpanded] = useState(isAccuracyFocus);

  return (
    <div className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">{strings.youSaid}</p>
        <p className="text-slate-800 dark:text-slate-100">{feedback.transcription}</p>
      </div>

      <div className="rounded-xl bg-sky-50 p-4 dark:bg-sky-950">
        <p className="text-slate-800 dark:text-slate-100">{feedback.tutorReply}</p>
        <p className="mt-2 font-medium text-slate-900 dark:text-white">
          {feedback.followUpQuestion}
        </p>
        {tutorAudioBase64 && (
          <button
            type="button"
            onClick={onReplay}
            className="mt-3 text-sm text-sky-600 dark:text-sky-400"
          >
            {strings.replay}
          </button>
        )}
      </div>

      {feedback.errors.length === 0 ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{strings.noErrors}</p>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setErrorsExpanded((v) => !v)}
            className="text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            {errorsExpanded
              ? strings.hideDetails
              : strings.thingsToPolish(feedback.errors.length)}
          </button>
          {errorsExpanded && (
            <div className="mt-2 flex flex-col gap-2">
              {feedback.errors.map((err, i) => (
                <div
                  key={i}
                  className={`rounded-lg border px-3 py-2 text-sm ${SEVERITY_STYLES[err.severity] ?? ''}`}
                >
                  <p>
                    <span className="line-through opacity-70">{err.quote}</span>{' '}
                    <span className="font-medium">→ {err.correction}</span>
                  </p>
                  <p className="mt-1 opacity-90">{err.explanation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
