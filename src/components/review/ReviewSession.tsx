'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UtteranceRecorder } from '@/components/recorder/UtteranceRecorder';
import { blobToBase64 } from '@/components/recorder/blobToBase64';
import { useSessionEndBeacon } from '@/components/practice/useSessionEndBeacon';
import { fetchJson, type ApiErrorKind } from '@/lib/apiError';
import { FeedbackCard } from '@/components/lesson/FeedbackCard';
import { useTutorAudioPlayer } from '@/components/lesson/useTutorAudioPlayer';
import { TEXT_ANSWER_MAX_CHARS } from '@/lib/zodSchemas';
import type { CoachingProfile } from '@/lib/db/schema';
import type { ReviewOutcome } from '@/lib/srs';
import type { LessonAttemptResponse, ReviewCard, ReviewGradeResponse } from '@/types';
import { t, type Locale } from '@/lib/i18n';

/**
 * The §13.4 review round. Spoken by default: the card's `front` is shown, the
 * learner records the answer, and it goes through /api/lesson/attempt with
 * `mode: 'review'` - the model judges the match against the expected `back`, which
 * the server reads from the item itself. Zero errors offers a good/easy choice;
 * errors show the normal feedback and grade `again`.
 *
 * This is deliberately NOT LessonPlayer: same recorder, same feedback card, but a
 * card-and-grade flow rather than a conversation that chains follow-up questions.
 */
export function ReviewSession({
  cards,
  coachingProfile,
  locale,
}: {
  cards: ReviewCard[];
  coachingProfile: CoachingProfile | null;
  locale: Locale;
}) {
  const strings = t(locale).reviewSession;
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<LessonAttemptResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'grading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [xpEarned, setXpEarned] = useState(0);
  const [gradedCount, setGradedCount] = useState(0);
  const [done, setDone] = useState(false);
  const player = useTutorAudioPlayer();
  // A review round opens a practice session of its own (mode 'review'), so it needs
  // the same leave-close as lessons and live conversation (PLAN.md §16 defect 1).
  const { markTurnRecorded } = useSessionEndBeacon('review');

  const card = cards[index];
  const answeredCorrectly = feedback !== null && feedback.errors.length === 0;

  // PLAN.md §8: 429 (daily cap) and timeouts get their own copy - a stuck request
  // reads very differently to a learner than "you're out of turns for today".
  const messageForError = useCallback(
    (kind: ApiErrorKind, fallback: string) => {
      if (kind === 'rate_limited') return strings.rateLimited;
      if (kind === 'timeout') return strings.timedOut;
      if (kind === 'network') return strings.networkError;
      return fallback;
    },
    [strings],
  );

  const submitAnswer = useCallback(
    async (input: { audioBase64: string; mimeType: string } | { text: string }) => {
      if (!card) return;
      setStatus('sending');
      setErrorMessage(null);
      const result = await fetchJson<LessonAttemptResponse>('/api/lesson/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, mode: 'review', reviewItemId: card.id }),
      });
      if (!result.ok) {
        setErrorMessage(messageForError(result.kind, result.message ?? strings.couldntCheckAnswer));
        setStatus('error');
        return;
      }

      const data = result.data;
      markTurnRecorded();
      setFeedback(data);
      setRevealed(true);
      setXpEarned((xp) => xp + data.gamification.xpAwarded);
      setStatus('idle');
      if (data.tutorAudioBase64) player.play(data.tutorAudioBase64);
      router.refresh(); // app-shell DailyGoalRing: review turns count toward the goal
    },
    [card, player, router, markTurnRecorded, strings, messageForError],
  );

  const handleRecorded = useCallback(
    async (blob: Blob, mimeType: string) => {
      const audioBase64 = await blobToBase64(blob);
      await submitAnswer({ audioBase64, mimeType });
    },
    [submitAnswer],
  );

  const grade = useCallback(
    async (outcome: ReviewOutcome) => {
      if (!card) return;
      setStatus('grading');
      setErrorMessage(null);
      try {
        const res = await fetch('/api/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: card.id, outcome }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrorMessage(data.error ?? strings.couldntSaveGrade);
          setStatus('error');
          return;
        }
        const data: ReviewGradeResponse = await res.json();
        setXpEarned((xp) => xp + data.gamification.xpAwarded);
        setGradedCount((n) => n + 1);

        // Next card
        setFeedback(null);
        setRevealed(false);
        setTyping(false);
        setTypedAnswer('');
        setStatus('idle');
        if (index + 1 >= cards.length) setDone(true);
        else setIndex((i) => i + 1);
        router.refresh();
      } catch {
        setErrorMessage(strings.networkError);
        setStatus('error');
      }
    },
    [card, cards.length, index, router, strings],
  );

  if (done || !card) {
    return (
      <div className="flex flex-1 flex-col items-center gap-4 px-5 py-10 sm:px-6">
        <span aria-hidden="true" className="animate-pop text-5xl">
          🎉
        </span>
        <p className="text-xl font-extrabold text-ink">{strings.roundComplete}</p>
        <p className="text-sm text-ink-muted">{strings.roundSummary(gradedCount, xpEarned)}</p>
        <div className="flex flex-col items-center gap-2">
          <Link href="/review" className="btn-primary">
            {strings.anotherRound}
          </Link>
          <Link href="/dashboard" className="btn-secondary btn-sm">
            {strings.backToDashboard}
          </Link>
        </div>
      </div>
    );
  }

  const busy = status === 'sending' || status === 'grading';

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-5 py-8 sm:px-6 sm:py-10">
      <div className="flex w-full max-w-lg items-center justify-between text-xs font-bold tracking-wide text-ink-muted uppercase">
        <span>{strings.cardOf(index + 1, cards.length)}</span>
        <span>{t(locale).gamification.xpAwarded(xpEarned)}</span>
      </div>

      <div className="card flex w-full max-w-lg flex-col gap-3 p-6 text-center">
        <p className="text-xs font-extrabold tracking-wide text-brand-600 uppercase dark:text-brand-300">
          {strings.kindLabel[card.kind]}
        </p>
        <p className="text-xl font-bold text-ink">{card.front}</p>
        {revealed ? (
          <p className="animate-rise rounded-xl bg-surface-muted px-3 py-2 font-bold text-ink">
            {card.back}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">{strings.sayItOutLoud}</p>
        )}
      </div>

      {!revealed &&
        (typing ? (
          <div className="flex w-full max-w-lg flex-col gap-2">
            <textarea
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              maxLength={TEXT_ANSWER_MAX_CHARS}
              rows={2}
              placeholder={strings.typePlaceholder}
              className="w-full rounded-2xl border-2 border-line bg-surface px-3 py-2 text-ink"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setTyping(false)}
                className="-mx-2 -my-1 cursor-pointer px-2 py-2 text-sm font-semibold text-ink-muted"
              >
                {strings.useMicInstead}
              </button>
              <button
                type="button"
                disabled={busy || typedAnswer.trim().length === 0}
                onClick={() => submitAnswer({ text: typedAnswer.trim() })}
                className="btn-primary btn-sm"
              >
                {strings.checkAnswer}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <UtteranceRecorder
              onRecorded={handleRecorded}
              onBeforeStart={player.unlock}
              disabled={busy}
              sending={status === 'sending'}
              locale={locale}
            />
            <div className="flex items-center gap-4">
              {/* §13.4: the quiet-environment fallback. Same pipeline, text input. */}
              <button
                type="button"
                onClick={() => setTyping(true)}
                className="-mx-2 -my-1 cursor-pointer px-2 py-2 text-sm font-semibold text-ink-muted underline"
              >
                {strings.typeInstead}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRevealed(true);
                  setFeedback(null);
                }}
                className="-mx-2 -my-1 cursor-pointer px-2 py-2 text-sm font-semibold text-ink-muted underline disabled:opacity-50"
              >
                {strings.dontKnow}
              </button>
            </div>
          </div>
        ))}

      {status === 'sending' && (
        <p className="text-sm text-ink-muted" aria-live="polite">
          {strings.checkingAnswer}
        </p>
      )}
      {errorMessage && (
        <p className="text-sm font-semibold text-brand-700 dark:text-brand-300" aria-live="polite">
          {errorMessage}
        </p>
      )}

      {feedback && (
        <FeedbackCard
          feedback={feedback}
          tutorAudioBase64={feedback.tutorAudioBase64}
          coachingProfile={coachingProfile}
          onReplay={() => feedback.tutorAudioBase64 && player.play(feedback.tutorAudioBase64)}
          locale={locale}
        />
      )}

      {revealed && (
        <div className="flex w-full max-w-lg flex-col gap-2">
          {answeredCorrectly ? (
            // Zero errors: the learner picks how hard it felt, which is what drives
            // the interval (§13.3). Getting it right is never graded `again` for them.
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => grade('good')}
                className="btn-success flex-1"
              >
                {strings.gotIt}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => grade('easy')}
                className="btn-primary flex-1"
              >
                {strings.easy}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => grade('again')}
              className="btn-secondary"
            >
              {strings.showAgain}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
