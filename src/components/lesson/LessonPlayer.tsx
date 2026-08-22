'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UtteranceRecorder } from '@/components/recorder/UtteranceRecorder';
import { blobToBase64 } from '@/components/recorder/blobToBase64';
import { useSessionEndBeacon } from '@/components/practice/useSessionEndBeacon';
import { fetchJson, type ApiErrorKind } from '@/lib/apiError';
import { FeedbackCard } from './FeedbackCard';
import { useTutorAudioPlayer } from './useTutorAudioPlayer';
import { XpToast } from '@/components/gamification/XpToast';
import { Celebration } from '@/components/gamification/Celebration';
import type { CoachingProfile } from '@/lib/db/schema';
import type { PlayerExercise } from '@/lib/lessons';
import type { LessonAttemptResponse, LessonCompleteResponse } from '@/types';
import { t, type Locale } from '@/lib/i18n';

/** §3.4 desirable difficulty: a listening clip can be replayed, but not indefinitely. */
const MAX_LISTEN_PLAYS = 3;

/**
 * The record→feedback loop, in two shapes:
 *
 * - **Guided** (a lesson, Phase 5B): walks `exercises` one at a time and reports
 *   completion to /api/lessons/[id]/complete, which enqueues the lesson's vocab for
 *   review (§13.2). `speak_prompt` records straight away; `listen_prompt` plays
 *   TTS audio first (≤3 plays, text never shown) and then records the same way.
 *   The exercise's index is sent to the server, which assembles the promptContext -
 *   see lib/lessons.ts.
 * - **Free practice** (no exercises): the Phase 3 behaviour, where each turn's
 *   followUpQuestion becomes the next turn's promptContext.
 */
export function LessonPlayer({
  coachingProfile,
  initialPrompt,
  lessonId,
  exercises = [],
  locale,
  onFinished,
  turnLimit,
  finishLabel,
}: {
  coachingProfile: CoachingProfile | null;
  initialPrompt: string;
  lessonId?: string;
  exercises?: PlayerExercise[];
  locale: Locale;
  /**
   * Set by an orchestrator that owns the ending - /today's session (ROADMAP.md
   * P0.4). The player hands back the XP it awarded instead of rendering its own
   * completion screen. The completion call itself is unchanged.
   */
  onFinished?: (xpEarned: number) => void;
  /** Free practice only: stop after this many turns instead of looping forever. */
  turnLimit?: number;
  /** Label for the button that ends a turn-limited free-practice run. */
  finishLabel?: string;
}) {
  const strings = t(locale).lessonPlayer;
  const router = useRouter();
  const isGuided = lessonId !== undefined && exercises.length > 0;

  const [step, setStep] = useState(0);
  const [promptContext, setPromptContext] = useState(initialPrompt);
  const [feedback, setFeedback] = useState<LessonAttemptResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [xpEvent, setXpEvent] = useState<{ id: number; xp: number } | null>(null);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(null);
  const [plays, setPlays] = useState(0);
  const [audioStatus, setAudioStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [summary, setSummary] = useState<LessonCompleteResponse | null>(null);
  const [xpEarned, setXpEarned] = useState(0);
  const [turnsTaken, setTurnsTaken] = useState(0);
  const player = useTutorAudioPlayer();
  // PLAN.md §16 defect 1: closes the practice_sessions row when the learner leaves.
  // Finishing a lesson closes it too (via /complete), so the beacon is the backstop
  // for leaving mid-lesson.
  const { markTurnRecorded } = useSessionEndBeacon('lesson', lessonId);
  // Keyed by exercise index: a replay must not cost another TTS call (§6.12 quota).
  const audioCache = useRef<Map<number, string>>(new Map());

  const exercise: PlayerExercise | null = isGuided ? (exercises[step] ?? null) : null;
  const isLastExercise = isGuided && step === exercises.length - 1;

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

  const playListenAudio = useCallback(async () => {
    if (!lessonId || !exercise || exercise.kind !== 'listen') return;
    if (plays >= MAX_LISTEN_PLAYS || audioStatus === 'loading') return;
    // Must happen inside the tap's own call stack for iOS (PLAN.md §4.5).
    player.unlock();

    const cached = audioCache.current.get(exercise.index);
    if (cached) {
      player.play(cached);
      setPlays((n) => n + 1);
      return;
    }

    setAudioStatus('loading');
    try {
      const res = await fetch(`/api/lessons/${lessonId}/audio?exercise=${exercise.index}`);
      if (!res.ok) {
        setAudioStatus('error');
        return;
      }
      const data: { audioBase64: string } = await res.json();
      audioCache.current.set(exercise.index, data.audioBase64);
      player.play(data.audioBase64);
      setPlays((n) => n + 1);
      setAudioStatus('idle');
    } catch {
      setAudioStatus('error');
    }
  }, [lessonId, exercise, plays, audioStatus, player]);

  const handleRecorded = useCallback(
    async (blob: Blob, mimeType: string) => {
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
      const body =
        isGuided && exercise
          ? { audioBase64, mimeType, lessonId, exerciseIndex: exercise.index }
          : { audioBase64, mimeType, lessonId, promptContext };

      const result = await fetchJson<LessonAttemptResponse>('/api/lesson/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!result.ok) {
        setErrorMessage(messageForError(result.kind, result.message ?? strings.couldntAnalyze));
        setStatus('error');
        return;
      }

      const data = result.data;
      markTurnRecorded();
      setFeedback(data);
      if (!isGuided) setPromptContext(data.followUpQuestion);
      setStatus('idle');
      if (data.tutorAudioBase64) player.play(data.tutorAudioBase64);

      // PLAN.md §12.2: XP toast after every turn; a short celebration on streak
      // milestones (lesson completion has its own, below).
      setXpEvent({ id: Date.now(), xp: data.gamification.xpAwarded });
      setXpEarned((xp) => xp + data.gamification.xpAwarded);
      setTurnsTaken((n) => n + 1);
      if (data.gamification.celebration?.type === 'streak_milestone') {
        setCelebrationMessage(strings.streakMilestone(data.gamification.celebration.milestone));
      }
      router.refresh(); // updates the app-shell header's DailyGoalRing/StreakBadge
    },
    [isGuided, exercise, lessonId, promptContext, player, router, markTurnRecorded, strings, messageForError],
  );

  const goToNextExercise = useCallback(() => {
    setFeedback(null);
    setPlays(0);
    setAudioStatus('idle');
    setStep((s) => s + 1);
  }, []);

  const finishLesson = useCallback(async () => {
    if (!lessonId) return;
    setStatus('sending');
    const result = await fetchJson<LessonCompleteResponse>(`/api/lessons/${lessonId}/complete`, {
      method: 'POST',
    });
    if (!result.ok) {
      setErrorMessage(messageForError(result.kind, result.message ?? strings.couldntSaveProgress));
      setStatus('error');
      return;
    }
    setFeedback(null);
    setStatus('idle');
    router.refresh();
    if (onFinished) {
      onFinished(xpEarned + result.data.gamification.xpAwarded);
      return;
    }
    setSummary(result.data);
    setCelebrationMessage(strings.lessonCompleteCelebration);
  }, [lessonId, router, strings, messageForError, onFinished, xpEarned]);

  if (summary) {
    return (
      <div className="flex flex-1 flex-col items-center gap-4 px-5 py-10 sm:px-6">
        <span aria-hidden="true" className="animate-pop text-6xl">
          🎉
        </span>
        <p className="text-xl font-extrabold text-ink">{strings.lessonComplete}</p>
        {summary.gamification.xpAwarded > 0 && (
          <p className="animate-pop rounded-full bg-success-100 px-4 py-1.5 text-sm font-extrabold text-success-700 dark:bg-success-500/20 dark:text-success-500">
            {t(locale).gamification.xpAwarded(summary.gamification.xpAwarded)}
          </p>
        )}
        <p className="max-w-sm text-center text-sm text-ink-muted">
          {summary.enqueuedCount > 0
            ? strings.newWordsAdded(summary.enqueuedCount)
            : strings.nothingNewForReview}
        </p>
        <div className="flex flex-col items-center gap-2">
          {summary.dueReviewCount > 0 && (
            <Link href="/review" className="btn-primary">
              {strings.reviewNow(summary.dueReviewCount)}
            </Link>
          )}
          <Link href="/lesson" className="btn-secondary btn-sm">
            {strings.backToLessons}
          </Link>
        </div>
        {celebrationMessage && (
          <Celebration message={celebrationMessage} onDismiss={() => setCelebrationMessage(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-5 py-8 sm:px-6 sm:py-10">
      {isGuided && (
        <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
          {strings.exerciseOf(step + 1, exercises.length)}
          {exercise?.kind === 'listen' ? strings.listeningSuffix : ''}
        </p>
      )}

      {exercise?.kind === 'listen' && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={playListenAudio}
            disabled={plays >= MAX_LISTEN_PLAYS || audioStatus === 'loading'}
            className="btn-primary btn-sm"
          >
            {audioStatus === 'loading'
              ? strings.loading
              : plays === 0
                ? strings.playClip
                : strings.playAgain}
          </button>
          <span className="text-xs font-semibold text-ink-muted">
            {plays >= MAX_LISTEN_PLAYS
              ? strings.noPlaysLeft
              : strings.playsLeft(MAX_LISTEN_PLAYS - plays)}
          </span>
          {audioStatus === 'error' && (
            <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">
              {strings.couldntLoadAudio}
            </span>
          )}
        </div>
      )}

      <p className="max-w-lg text-center text-xl font-semibold text-balance text-ink">
        {exercise ? exercise.prompt : promptContext}
      </p>

      <UtteranceRecorder
        onRecorded={handleRecorded}
        onBeforeStart={player.unlock}
        disabled={status === 'sending'}
        sending={status === 'sending'}
        locale={locale}
      />

      {status === 'sending' && (
        <p className="text-sm text-ink-muted" aria-live="polite">
          {strings.analyzing}
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

      {isGuided && feedback && (
        <button
          type="button"
          onClick={isLastExercise ? finishLesson : goToNextExercise}
          disabled={status === 'sending'}
          className="btn-primary"
        >
          {isLastExercise ? strings.finishLesson : strings.nextExercise}
        </button>
      )}

      {/* Free practice with a turn limit: /today's closing speaking turn. The
          loop is otherwise open-ended, so the orchestrator ends it here. */}
      {!isGuided && feedback && turnLimit !== undefined && turnsTaken >= turnLimit && (
        <button
          type="button"
          onClick={() => onFinished?.(xpEarned)}
          disabled={status === 'sending'}
          className="btn-primary"
        >
          {finishLabel ?? strings.finishLesson}
        </button>
      )}

      {xpEvent && (
        <XpToast
          key={xpEvent.id}
          xpAwarded={xpEvent.xp}
          onDismiss={() => setXpEvent(null)}
          locale={locale}
        />
      )}
      {celebrationMessage && (
        <Celebration message={celebrationMessage} onDismiss={() => setCelebrationMessage(null)} />
      )}
    </div>
  );
}
