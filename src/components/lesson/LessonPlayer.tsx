'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import type { PlayerDialogue, PlayerExercise } from '@/lib/lessons';
import type { LessonVocabItem } from '@/lib/srs';
import type { LessonAttemptResponse, LessonCompleteResponse } from '@/types';
import { t, type Locale } from '@/lib/i18n';

/** §3.4 desirable difficulty: a listening clip can be replayed, but not indefinitely. */
const MAX_LISTEN_PLAYS = 3;

/**
 * One retry per exercise. Producing the corrected sentence immediately after hearing
 * the fix is where the learning actually happens - but every attempt is a graded turn
 * against the daily cap (§6.5), so this is deliberately "one more go", not unlimited.
 */
const MAX_ATTEMPTS_PER_EXERCISE = 2;

/**
 * The record→feedback loop, in two shapes:
 *
 * - **Vocab step** (ROADMAP.md P1.5): when a guided lesson brings `vocab`, the words
 *   come first as tap-to-hear chips - nothing recorded, nothing graded - and the
 *   exercises start when the learner says they are ready. Audio is fetched by INDEX
 *   from the lesson's own audio route, so the words are never sent to TTS from here.
 * - **Guided** (a lesson, Phase 5B): walks `exercises` one at a time and reports
 *   completion to /api/lessons/[id]/complete, which enqueues the lesson's vocab for
 *   review (§13.2). `speak_prompt` records straight away; `listen_prompt` plays
 *   TTS audio first (≤3 plays, text never shown) and then records the same way.
 *   The exercise's index is sent to the server, which assembles the promptContext -
 *   see lib/lessons.ts.
 * - **Free practice** (no exercises): the Phase 3 behaviour, where each turn's
 *   followUpQuestion becomes the next turn's promptContext.
 */
const stepKey = (exercise: PlayerExercise) => `${exercise.kind === 'dialogue' ? 'd' : 'e'}${exercise.index}`;

/** What one exercise ended up looking like, for the end-of-lesson scorecard. */
type ExerciseResult = {
  errorCount: number;
  /** The tutor's version of what they said - the sentence worth remembering. */
  corrected: string;
  attempts: number;
};

export function LessonPlayer({
  coachingProfile,
  initialPrompt,
  lessonId,
  exercises = [],
  vocab = [],
  dialogue = null,
  nextLesson,
  locale,
  onFinished,
  turnLimit,
  finishLabel,
}: {
  coachingProfile: CoachingProfile | null;
  initialPrompt: string;
  lessonId?: string;
  exercises?: PlayerExercise[];
  /** Shown as the tap-to-hear vocab step before the first exercise (P1.5). */
  vocab?: LessonVocabItem[];
  /**
   * The lesson's exchange (ROADMAP.md lesson-loop item 4). Played and read whole as a
   * step of its own; the learner's own lines arrive inside `exercises` as steps of
   * kind 'dialogue', so they walk the same graded loop as everything else.
   */
  dialogue?: PlayerDialogue | null;
  /** Offered from the completion screen so a good run can continue immediately. */
  nextLesson?: { id: string; title: string } | null;
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

  // The vocab step is where a guided lesson STARTS when it has words to present.
  const [showVocab, setShowVocab] = useState(
    () => lessonId !== undefined && exercises.length > 0 && vocab.length > 0,
  );
  const [vocabAudioStatus, setVocabAudioStatus] = useState<'idle' | 'unavailable'>('idle');
  const [showDialogue, setShowDialogue] = useState(
    () => lessonId !== undefined && exercises.length > 0 && dialogue !== null,
  );
  const [dialoguePlaying, setDialoguePlaying] = useState<number | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [playingVocab, setPlayingVocab] = useState<number | null>(null);
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
  // Per-exercise attempt count (the retry budget) and the outcome the scorecard reads.
  const [attempts, setAttempts] = useState(0);
  // Keyed by kind+index: a dialogue line 0 and an exercise 0 are different steps.
  const [results, setResults] = useState<Record<string, ExerciseResult>>({});
  // An object URL for the learner's own last recording, so they can hear it back
  // against the tutor's version. Revoked as soon as it is replaced (below).
  const [ownRecordingUrl, setOwnRecordingUrl] = useState<string | null>(null);
  const ownAudioRef = useRef<HTMLAudioElement | null>(null);
  const player = useTutorAudioPlayer();
  // PLAN.md §16 defect 1: closes the practice_sessions row when the learner leaves.
  // Finishing a lesson closes it too (via /complete), so the beacon is the backstop
  // for leaving mid-lesson.
  const { markTurnRecorded } = useSessionEndBeacon('lesson', lessonId);
  // Keyed by '<slot>:<index>': a replay must not cost another TTS call (§6.12 quota).
  // Vocab chips are tapped far more often than a listening prompt is replayed, so this
  // matters more for them than it ever did for exercises.
  const audioCache = useRef<Map<string, string>>(new Map());

  // Leaving mid-lesson must not leak the last recording, and must not leave an
  // Audio element playing over the next page.
  useEffect(() => {
    return () => {
      ownAudioRef.current?.pause();
      if (ownRecordingUrl) URL.revokeObjectURL(ownRecordingUrl);
    };
  }, [ownRecordingUrl]);

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

    const cached = audioCache.current.get(`exercise:${exercise.index}`);
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
      audioCache.current.set(`exercise:${exercise.index}`, data.audioBase64);
      player.play(data.audioBase64);
      setPlays((n) => n + 1);
      setAudioStatus('idle');
    } catch {
      setAudioStatus('error');
    }
  }, [lessonId, exercise, plays, audioStatus, player]);

  /**
   * Plays one item of a lesson's audio - a vocab chip or a dialogue line - by index.
   * Shared so both cost exactly one synthesis each, cached per slot, and so a pair
   * with no voice degrades the same way in both places.
   */
  const playSlotAudio = useCallback(
    async (slot: 'vocab' | 'dialogue', index: number, onEnded?: () => void) => {
      if (!lessonId || vocabAudioStatus === 'unavailable') {
        onEnded?.();
        return;
      }
      player.unlock();
      const cacheKey = `${slot}:${index}`;
      const cached = audioCache.current.get(cacheKey);
      if (cached) {
        player.play(cached, onEnded);
        return;
      }
      try {
        const res = await fetch(`/api/lessons/${lessonId}/audio?${slot}=${index}`);
        if (!res.ok) {
          if (res.status === 409) setVocabAudioStatus('unavailable');
          onEnded?.();
          return;
        }
        const data: { audioBase64: string } = await res.json();
        audioCache.current.set(cacheKey, data.audioBase64);
        player.play(data.audioBase64, onEnded);
      } catch {
        onEnded?.();
      }
    },
    [lessonId, player, vocabAudioStatus],
  );

  const playVocabAudio = useCallback(
    (index: number) => {
      setPlayingVocab(index);
      void playSlotAudio('vocab', index, () => setPlayingVocab(null));
    },
    [playSlotAudio],
  );

  /**
   * Plays the exchange from `index` to the end, one line after another - the "listen
   * to the whole thing" half of the dialogue step. Chained through a ref because each
   * line's onEnded has to reach the CURRENT function, not the one captured when
   * playback started.
   */
  const playDialogueFromRef = useRef<(index: number) => void>(() => {});
  const playDialogueFrom = useCallback(
    (index: number) => {
      const line = dialogue?.lines[index];
      if (!line) {
        setDialoguePlaying(null);
        return;
      }
      setDialoguePlaying(index);
      void playSlotAudio('dialogue', index, () => playDialogueFromRef.current(index + 1));
    },
    [dialogue, playSlotAudio],
  );
  // Assigned in an effect, not during render: React owns the render pass, and a ref
  // written there is a tear waiting to happen under concurrent rendering.
  useEffect(() => {
    playDialogueFromRef.current = playDialogueFrom;
  }, [playDialogueFrom]);

  /**
   * One line on its own. No chaining: the tutor audio element is shared, so starting a
   * line mid-run reassigns its `onended` and the run simply stops where it was - which
   * is what tapping a line means.
   */
  const playDialogueLine = useCallback(
    (index: number) => {
      setDialoguePlaying(index);
      void playSlotAudio('dialogue', index, () => setDialoguePlaying(null));
    },
    [playSlotAudio],
  );

  const handleRecorded = useCallback(
    async (blob: Blob, mimeType: string) => {
      setStatus('sending');
      setErrorMessage(null);
      // Kept for "hear yourself": the blob is already in hand, so this costs one
      // object URL and nothing else. The previous turn's URL is released here rather
      // than on unmount alone, so a long lesson doesn't accumulate them.
      setOwnRecordingUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });

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
          ? exercise.kind === 'dialogue'
            ? { audioBase64, mimeType, lessonId, dialogueLineIndex: exercise.index }
            : { audioBase64, mimeType, lessonId, exerciseIndex: exercise.index }
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
      if (isGuided && exercise) {
        // A retry REPLACES the exercise's result: the question the scorecard answers
        // is "did they end up saying it right", not "did they say it right first time".
        setAttempts((n) => n + 1);
        setResults((current) => {
          const key = stepKey(exercise);
          return {
            ...current,
            [key]: {
              errorCount: data.errors.length,
              corrected: data.correctedUtterance,
              attempts: (current[key]?.attempts ?? 0) + 1,
            },
          };
        });
      }
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
    setAttempts(0);
    setPeeking(false);
    setAudioStatus('idle');
    setStep((s) => s + 1);
  }, []);

  /**
   * The retry (ROADMAP.md lesson-loop item 1). Clears the feedback but NOT the step,
   * so the recorder comes back on the same exercise with the correction still fresh.
   * The listening budget is not refunded - they have already heard the clip.
   */
  const retryExercise = useCallback(() => {
    setFeedback(null);
    setErrorMessage(null);
  }, []);

  const playOwnRecording = useCallback(() => {
    if (!ownRecordingUrl) return;
    // Inside the tap's own call stack, so iOS allows it (PLAN.md §4.5). A separate
    // element from the tutor's: playing one must not cut the other off mid-word.
    const audio = (ownAudioRef.current ??= new Audio());
    audio.src = ownRecordingUrl;
    audio.play().catch(() => {});
  }, [ownRecordingUrl]);

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
    // The scorecard (ROADMAP.md lesson-loop item 3). Counted over the exercises that
    // were actually attempted, so leaving one unanswered can't read as a clean run.
    const attempted = Object.values(results);
    const cleanCount = attempted.filter((r) => r.errorCount === 0).length;
    // "The one sentence to remember" is the tutor's version of the turn that went
    // worst - one thing to carry away beats a list nobody rereads.
    const worst = attempted.reduce<ExerciseResult | null>(
      (acc, r) => (r.errorCount > 0 && (!acc || r.errorCount > acc.errorCount) ? r : acc),
      null,
    );

    return (
      <div className="flex flex-1 flex-col items-center gap-4 px-5 py-10 sm:px-6">
        <span aria-hidden="true" className="animate-pop text-6xl">
          🎉
        </span>
        <p className="text-xl font-extrabold text-ink">{strings.lessonComplete}</p>

        {attempted.length > 0 && (
          <div className="flex w-full max-w-sm flex-col items-center gap-3">
            <p className="text-base font-extrabold text-ink">
              {strings.scorecard(cleanCount, attempted.length)}
            </p>
            <div className="flex gap-1.5" aria-hidden="true">
              {exercises.map((ex) => {
                const result = results[stepKey(ex)];
                return (
                  <span
                    key={ex.index}
                    className={`size-2.5 rounded-full ${
                      !result
                        ? 'bg-surface-muted'
                        : result.errorCount === 0
                          ? 'bg-success-500'
                          : 'bg-brand-400'
                    }`}
                  />
                );
              })}
            </div>
            {worst ? (
              <div className="card w-full py-3">
                <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
                  {strings.rememberThis}
                </p>
                <p className="mt-1 font-semibold text-ink">{worst.corrected}</p>
              </div>
            ) : (
              <p className="text-sm font-bold text-success-600">{strings.scorecardPerfect}</p>
            )}
          </div>
        )}
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
          {/* Item 7: a finished lesson offers the next one directly. Review still wins
              the primary slot when something is due - the queue is time-sensitive and
              the next lesson is not. */}
          {summary.dueReviewCount > 0 && (
            <Link href="/review" className="btn-primary">
              {strings.reviewNow(summary.dueReviewCount)}
            </Link>
          )}
          {nextLesson && (
            <Link
              href={`/lesson/${nextLesson.id}`}
              className={summary.dueReviewCount > 0 ? 'btn-secondary' : 'btn-primary'}
            >
              {strings.nextLesson(nextLesson.title)}
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

  // The words, before any production is asked for. Deliberately not a carousel and
  // not timed: the learner decides when to move on.
  if (showVocab) {
    return (
      <div className="flex w-full flex-1 flex-col gap-4 py-6">
        <div className="flex flex-col gap-1">
          <h2 className="heading-section">{strings.vocabTitle}</h2>
          <p className="text-sm text-ink-muted">
            {vocabAudioStatus === 'unavailable' ? strings.vocabAudioUnavailable : strings.vocabHint}
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {vocab.map((item, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => playVocabAudio(i)}
                disabled={vocabAudioStatus === 'unavailable'}
                className="card flex w-full items-center justify-between gap-3 text-left transition-transform active:scale-[0.99] disabled:active:scale-100"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-bold text-ink">{item.term}</span>
                  <span className="text-sm text-ink-muted">{item.gloss}</span>
                  {item.note && <span className="mt-1 text-xs text-ink-muted italic">{item.note}</span>}
                </span>
                {vocabAudioStatus === 'idle' && (
                  <span aria-hidden="true" className="shrink-0 text-xl">
                    {playingVocab === i ? '…' : '🔊'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <button type="button" onClick={() => setShowVocab(false)} className="btn-primary self-start">
          {strings.startExercises}
        </button>
      </div>
    );
  }

  // The exchange, whole, before any of it is performed (ROADMAP.md lesson-loop item 4).
  // Everything is visible here on purpose: this is the model, not the test.
  if (showDialogue && dialogue) {
    return (
      <div className="flex w-full flex-1 flex-col gap-4 py-6">
        <div className="flex flex-col gap-1">
          <h2 className="heading-section">{strings.dialogueTitle}</h2>
          <p className="text-sm text-ink-muted">
            {vocabAudioStatus === 'unavailable' ? strings.vocabAudioUnavailable : strings.dialogueHint}
          </p>
          {dialogue.setup && <p className="text-sm font-semibold text-ink">{dialogue.setup}</p>}
        </div>

        {vocabAudioStatus === 'idle' && (
          <button
            type="button"
            onClick={() => playDialogueFrom(0)}
            className="btn-secondary self-start"
          >
            {strings.playWholeDialogue}
          </button>
        )}

        <ul className="flex flex-col gap-2">
          {dialogue.lines.map((line) => (
            <li key={line.index}>
              <button
                type="button"
                onClick={() => playDialogueLine(line.index)}
                disabled={vocabAudioStatus === 'unavailable'}
                className={`card flex w-full items-start justify-between gap-3 text-left transition-transform active:scale-[0.99] disabled:active:scale-100 ${
                  dialoguePlaying === line.index ? 'ring-2 ring-brand-400' : ''
                } ${line.isLearner ? 'border-l-4 border-l-brand-400' : ''}`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs font-bold tracking-wide text-ink-muted uppercase">
                    {line.speaker}
                    {line.isLearner ? ` · ${strings.yourLine}` : ''}
                  </span>
                  <span className="font-semibold text-ink">{line.text}</span>
                  {line.gloss && <span className="text-sm text-ink-muted">{line.gloss}</span>}
                </span>
                {vocabAudioStatus === 'idle' && (
                  <span aria-hidden="true" className="shrink-0 text-xl">
                    {dialoguePlaying === line.index ? '🔈' : '🔊'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setShowDialogue(false)}
          className="btn-primary self-start"
        >
          {strings.yourTurnNow}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-5 py-8 sm:px-6 sm:py-10">
      {isGuided && (
        <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
          {strings.exerciseOf(step + 1, exercises.length)}
          {exercise?.kind === 'listen' ? strings.listeningSuffix : ''}
          {exercise?.kind === 'fill_gap' ? strings.fillGapSuffix : ''}
          {exercise?.kind === 'dialogue' ? strings.dialogueSuffix : ''}
          {attempts > 0 && !feedback ? ` · ${strings.secondAttempt}` : ''}
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

      {/* A dialogue turn: what was just said to them, then their cue. The line itself
          is one tap away rather than on screen - reading it aloud is a different (and
          much easier) exercise than producing it from the meaning. */}
      {exercise?.kind === 'dialogue' && (
        <div className="flex w-full max-w-lg flex-col items-center gap-3">
          {exercise.contextLine && (
            <div className="card w-full py-3">
              <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
                {strings.theySaid}
              </p>
              <p className="mt-1 font-semibold text-ink">{exercise.contextLine}</p>
            </div>
          )}
          {peeking ? (
            <p className="text-lg font-extrabold text-balance text-ink">{exercise.answer}</p>
          ) : (
            <button
              type="button"
              onClick={() => setPeeking(true)}
              className="cursor-pointer px-2 py-1 text-sm font-bold text-ink-muted"
            >
              {strings.peekAtTheLine}
            </button>
          )}
        </div>
      )}

      {/* The gapped sentence is the thing being read, so it outweighs the instruction
          above it. The completed answer stays on the server (lib/lessons.ts). */}
      {exercise?.kind === 'fill_gap' && exercise.sentence && (
        <div className="flex max-w-lg flex-col items-center gap-2">
          <p className="card-raised px-5 py-4 text-center text-2xl font-extrabold text-balance text-ink">
            {exercise.sentence}
          </p>
          <p className="text-xs font-semibold text-ink-muted">{strings.fillGapHint}</p>
        </div>
      )}

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
          onPlayOwnRecording={ownRecordingUrl ? playOwnRecording : undefined}
          locale={locale}
        />
      )}

      {isGuided && feedback && (
        <div className="flex flex-col items-center gap-2">
          {/* Item 1: say it again, now that the correction is on screen. Offered
              whether or not there were errors - a clean turn said more fluently is
              still worth having - but only once, because every attempt is graded. */}
          {attempts < MAX_ATTEMPTS_PER_EXERCISE && (
            <button
              type="button"
              onClick={retryExercise}
              disabled={status === 'sending'}
              className="btn-secondary"
            >
              {strings.sayItAgain}
            </button>
          )}
          <button
            type="button"
            onClick={isLastExercise ? finishLesson : goToNextExercise}
            disabled={status === 'sending'}
            className="btn-primary"
          >
            {isLastExercise ? strings.finishLesson : strings.nextExercise}
          </button>
          {attempts >= MAX_ATTEMPTS_PER_EXERCISE && (
            <span className="text-xs font-semibold text-ink-muted">
              {strings.secondAttemptDone}
            </span>
          )}
        </div>
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
