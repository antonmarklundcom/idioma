'use client';

import { useState } from 'react';
import { correctionIsMeaningful, markUpTranscript } from '@/lib/transcriptMarkup';
import type { FeedbackResult } from '@/lib/zodSchemas';
import type { CoachingProfile } from '@/lib/db/schema';
import { t, type Locale } from '@/lib/i18n';

// The in-place marks on the learner's own sentence. Underline rather than fill: a
// filled span in the middle of a sentence reads as a highlight ("this bit matters"),
// an underline reads as a correction - which is the whole point of showing it.
const SEVERITY_MARKS: Record<string, string> = {
  minor: 'decoration-amber-500',
  moderate: 'decoration-orange-500',
  major: 'decoration-red-500',
};

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
  onPlayOwnRecording,
  locale,
  expandErrors,
}: {
  feedback: FeedbackResult;
  tutorAudioBase64: string | null;
  coachingProfile: CoachingProfile | null;
  onReplay: () => void;
  /**
   * Plays back the learner's OWN recording of this turn. Hearing the model sentence
   * and then your own attempt, back to back, is the cheapest pronunciation feedback
   * there is - the audio has already been captured either way.
   */
  onPlayOwnRecording?: () => void;
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
  const { segments } = markUpTranscript(feedback.transcription, feedback.errors);
  const showCorrected = correctionIsMeaningful(feedback.transcription, feedback.correctedUtterance);

  return (
    <div className="card animate-rise flex w-full max-w-lg flex-col gap-4 p-5">
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
            {strings.youSaid}
          </p>
          {/* Their own sentence, with the wrong parts marked where they happened. */}
          <p className="text-ink">
            {segments.map((segment, i) =>
              segment.error ? (
                <span
                  key={i}
                  className={`underline decoration-wavy decoration-2 underline-offset-4 ${
                    SEVERITY_MARKS[segment.error.severity] ?? ''
                  }`}
                >
                  {segment.text}
                </span>
              ) : (
                <span key={i}>{segment.text}</span>
              ),
            )}
          </p>
        </div>

        {showCorrected && (
          <div>
            <p className="text-xs font-bold tracking-wide text-success-700 uppercase dark:text-success-500">
              {strings.closerTo}
            </p>
            <p className="font-semibold text-ink">{feedback.correctedUtterance}</p>
          </div>
        )}

        {onPlayOwnRecording && (
          <button
            type="button"
            onClick={onPlayOwnRecording}
            className="-mx-2 -my-1 cursor-pointer self-start px-2 py-2 text-sm font-bold text-ink-muted"
          >
            {strings.hearYourself}
          </button>
        )}
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
