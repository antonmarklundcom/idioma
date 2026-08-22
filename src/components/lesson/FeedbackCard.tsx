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
  expandErrors,
}: {
  feedback: FeedbackResult;
  tutorAudioBase64: string | null;
  coachingProfile: CoachingProfile | null;
  onReplay: () => void;
  locale: Locale;
  /**
   * Overrides the coaching profile's default for this card - /live's "Correct me"
   * switch. Kept as a DEFAULT rather than a controlled value: a learner who opens
   * the details on one card should keep them open even if the switch says otherwise.
   */
  expandErrors?: boolean;
}) {
  const strings = t(locale).feedbackCard;
  const isAccuracyFocus = coachingProfile === 'accuracy_focus';
  // null = "follow whatever the parent/profile says"; a click pins it either way.
  const [pinned, setPinned] = useState<boolean | null>(null);
  const errorsExpanded = pinned ?? expandErrors ?? isAccuracyFocus;
  const setErrorsExpanded = (next: boolean) => setPinned(next);

  return (
    <div className="card animate-rise flex w-full max-w-lg flex-col gap-4 p-5">
      <div>
        <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">{strings.youSaid}</p>
        <p className="text-ink">{feedback.transcription}</p>
      </div>

      <div className="rounded-2xl bg-surface-muted p-4">
        <p className="text-ink">{feedback.tutorReply}</p>
        <p className="mt-2 font-bold text-ink">{feedback.followUpQuestion}</p>
        {tutorAudioBase64 && (
          <button
            type="button"
            onClick={onReplay}
            className="-mx-2 -my-1 mt-3 cursor-pointer px-2 py-2 text-sm font-bold text-brand-600 dark:text-brand-300"
          >
            {strings.replay}
          </button>
        )}
      </div>

      {feedback.errors.length === 0 ? (
        <p className="text-sm font-bold text-success-600">✨ {strings.noErrors}</p>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setErrorsExpanded(!errorsExpanded)}
            aria-expanded={errorsExpanded}
            className="-mx-2 -my-1 cursor-pointer px-2 py-2 text-sm font-bold text-ink-muted"
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
                  className={`rounded-xl border-2 px-3 py-2 text-sm ${SEVERITY_STYLES[err.severity] ?? ''}`}
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
