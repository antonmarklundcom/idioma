'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UtteranceRecorder } from '@/components/recorder/UtteranceRecorder';
import { blobToBase64 } from '@/components/recorder/blobToBase64';
import { FeedbackCard } from '@/components/lesson/FeedbackCard';
import { useTutorAudioPlayer } from '@/components/lesson/useTutorAudioPlayer';
import { TEXT_ANSWER_MAX_CHARS } from '@/lib/zodSchemas';
import type { CoachingProfile } from '@/lib/db/schema';
import type { ReviewOutcome } from '@/lib/srs';
import type { LessonAttemptResponse, ReviewCard, ReviewGradeResponse } from '@/types';

const KIND_LABEL: Record<ReviewCard['kind'], string> = {
  vocab: 'Vocabulary',
  error_pattern: 'A mistake you keep making',
};

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
}: {
  cards: ReviewCard[];
  coachingProfile: CoachingProfile | null;
}) {
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

  const card = cards[index];
  const answeredCorrectly = feedback !== null && feedback.errors.length === 0;

  const submitAnswer = useCallback(
    async (input: { audioBase64: string; mimeType: string } | { text: string }) => {
      if (!card) return;
      setStatus('sending');
      setErrorMessage(null);
      try {
        const res = await fetch('/api/lesson/attempt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, mode: 'review', reviewItemId: card.id }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrorMessage(data.error ?? "Couldn't check that answer. Try again.");
          setStatus('error');
          return;
        }
        const data: LessonAttemptResponse = await res.json();
        setFeedback(data);
        setRevealed(true);
        setXpEarned((xp) => xp + data.gamification.xpAwarded);
        setStatus('idle');
        if (data.tutorAudioBase64) player.play(data.tutorAudioBase64);
        router.refresh(); // app-shell DailyGoalRing: review turns count toward the goal
      } catch {
        setErrorMessage('Network error - please try again.');
        setStatus('error');
      }
    },
    [card, player, router],
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
          setErrorMessage(data.error ?? "Couldn't save that grade. Try again.");
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
        setErrorMessage('Network error - please try again.');
        setStatus('error');
      }
    },
    [card, cards.length, index, router],
  );

  if (done || !card) {
    return (
      <div className="flex flex-1 flex-col items-center gap-4 px-6 py-10">
        <p className="text-lg font-semibold text-slate-900 dark:text-white">Round complete 🎉</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {gradedCount} item{gradedCount === 1 ? '' : 's'} reviewed · +{xpEarned} XP
        </p>
        <div className="flex flex-col items-center gap-2">
          <Link
            href="/review"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          >
            Another round
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const busy = status === 'sending' || status === 'grading';

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-6 py-10">
      <div className="flex w-full max-w-lg items-center justify-between text-xs uppercase tracking-wide text-slate-400">
        <span>
          Card {index + 1} of {cards.length}
        </span>
        <span>+{xpEarned} XP</span>
      </div>

      <div className="flex w-full max-w-lg flex-col gap-3 rounded-2xl border border-slate-200 p-5 text-center dark:border-slate-700">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">
          {KIND_LABEL[card.kind]}
        </p>
        <p className="text-lg text-slate-800 dark:text-slate-100">{card.front}</p>
        {revealed ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 font-medium text-slate-900 dark:bg-slate-800 dark:text-white">
            {card.back}
          </p>
        ) : (
          <p className="text-sm text-slate-400">Say it out loud, then tap the mic.</p>
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
              placeholder="Type your answer"
              className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setTyping(false)}
                className="text-sm text-slate-500 dark:text-slate-400"
              >
                Use the mic instead
              </button>
              <button
                type="button"
                disabled={busy || typedAnswer.trim().length === 0}
                onClick={() => submitAnswer({ text: typedAnswer.trim() })}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Check answer
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <UtteranceRecorder
              onRecorded={handleRecorded}
              onBeforeStart={player.unlock}
              disabled={busy}
            />
            <div className="flex items-center gap-4">
              {/* §13.4: the quiet-environment fallback. Same pipeline, text input. */}
              <button
                type="button"
                onClick={() => setTyping(true)}
                className="text-sm text-slate-500 underline dark:text-slate-400"
              >
                Type instead
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRevealed(true);
                  setFeedback(null);
                }}
                className="text-sm text-slate-500 underline disabled:opacity-50 dark:text-slate-400"
              >
                I don&apos;t know
              </button>
            </div>
          </div>
        ))}

      {status === 'sending' && <p className="text-sm text-slate-400">Checking your answer…</p>}
      {errorMessage && <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>}

      {feedback && (
        <FeedbackCard
          feedback={feedback}
          tutorAudioBase64={feedback.tutorAudioBase64}
          coachingProfile={coachingProfile}
          onReplay={() => feedback.tutorAudioBase64 && player.play(feedback.tutorAudioBase64)}
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
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Got it
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => grade('easy')}
                className="flex-1 rounded-lg bg-sky-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Easy
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => grade('again')}
              className="rounded-lg bg-slate-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-600"
            >
              Show me again in 10 minutes
            </button>
          )}
        </div>
      )}
    </div>
  );
}
