'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UtteranceRecorder } from '@/components/recorder/UtteranceRecorder';
import { blobToBase64 } from '@/components/recorder/blobToBase64';
import { useSessionEndBeacon } from '@/components/practice/useSessionEndBeacon';
import { fetchJson, type ApiErrorKind } from '@/lib/apiError';
import { FeedbackCard } from '@/components/lesson/FeedbackCard';
import { useTutorAudioPlayer } from '@/components/lesson/useTutorAudioPlayer';
import { XpToast } from '@/components/gamification/XpToast';
import { Celebration } from '@/components/gamification/Celebration';
import type { CoachingProfile } from '@/lib/db/schema';
import type { LessonAttemptResponse } from '@/types';
import { t, type Locale } from '@/lib/i18n';

// PLAN.md §4.3: the $0 turn-based conversation loop. A thin wrapper around the same
// /api/lesson/attempt pipeline as lesson mode (mode: 'live', no lessonId) - walkie-talkie
// style back-and-forth instead of a fixed exercise. No new API routes, no ephemeral
// tokens, no true real-time voice (that's the documented-but-deferred §4.2 upgrade).
export function ConversationLoop({
  coachingProfile,
  locale,
  handsFree = false,
}: {
  coachingProfile: CoachingProfile | null;
  locale: Locale;
  /**
   * PLAN.md §8 Phase 7B item 2. Two halves of one setting: the recorder auto-stops when
   * the learner stops talking, and the mic reopens when the tutor stops talking - so a
   * turn completes with no taps at all after the first one.
   */
  handsFree?: boolean;
}) {
  const strings = t(locale).live;
  const router = useRouter();
  const [promptContext, setPromptContext] = useState(strings.openingPrompt);
  const [feedback, setFeedback] = useState<LessonAttemptResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  // Owner request: "correct me if I want to". The tutor grades every turn either
  // way - this only decides whether the corrections are open or tucked away, so
  // flipping it costs nothing and loses nothing. Starts from the coaching profile.
  const [correctMe, setCorrectMe] = useState(coachingProfile === 'accuracy_focus');
  const [xpEvent, setXpEvent] = useState<{ id: number; xp: number } | null>(null);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(null);
  // Bumped when the tutor finishes speaking; UtteranceRecorder watches it to reopen the
  // mic. A counter rather than a boolean so two consecutive turns are distinguishable.
  const [autoStartToken, setAutoStartToken] = useState(0);
  /**
   * Hands-free walked away: the mic opened, nobody said anything, and the turn was
   * dropped before it cost anything. The loop stops here instead of reopening the mic
   * on a timer, and says so - a conversation that goes silent for no visible reason
   * reads as the app being broken.
   */
  const [afkPaused, setAfkPaused] = useState(false);
  const player = useTutorAudioPlayer();
  // PLAN.md §16 defect 1: closes the practice_sessions row when the learner leaves.
  const { markTurnRecorded, endSessionNow } = useSessionEndBeacon('live');

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
      const result = await fetchJson<LessonAttemptResponse>('/api/lesson/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType, mode: 'live', promptContext }),
      });
      if (!result.ok) {
        setErrorMessage(messageForError(result.kind, result.message ?? strings.couldntAnalyze));
        setStatus('error');
        return;
      }

      const data = result.data;
      markTurnRecorded();
      setFeedback(data);
      setPromptContext(data.followUpQuestion);
      setTurnCount((n) => n + 1);
      setStatus('idle');
      if (data.tutorAudioBase64) {
        player.play(data.tutorAudioBase64, handsFree ? () => setAutoStartToken((n) => n + 1) : undefined);
      } else if (handsFree) {
        // No audio this turn (TTS off, over its cap, or failed) - the loop still has
        // to hand the mic back, or hands-free would dead-end on a text-only reply.
        setAutoStartToken((n) => n + 1);
      }

      setXpEvent({ id: Date.now(), xp: data.gamification.xpAwarded });
      if (data.gamification.celebration?.type === 'streak_milestone') {
        setCelebrationMessage(strings.streakMilestone(data.gamification.celebration.milestone));
      }
      router.refresh();
    },
    [promptContext, player, router, markTurnRecorded, strings, messageForError, handsFree],
  );

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-5 py-8 sm:px-6 sm:py-10">
      <div className="flex w-full max-w-lg items-center justify-between gap-3">
        <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
          {strings.turnOf(turnCount + 1)}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={correctMe}
          aria-label={strings.correctionsLabel}
          onClick={() => setCorrectMe((v) => !v)}
          className={`chip ${correctMe ? 'chip-active' : ''}`}
        >
          {correctMe ? strings.correctionsOn : strings.correctionsOff}
        </button>
      </div>
      <p className="max-w-lg text-center text-xl font-semibold text-balance text-ink">
        {promptContext}
      </p>

      {afkPaused ? (
        <div className="flex flex-col items-center gap-3">
          <p className="max-w-lg text-center text-base font-bold text-ink">{strings.afkPaused}</p>
          <button
            type="button"
            onClick={() => {
              player.unlock();
              setAfkPaused(false);
              setAutoStartToken((n) => n + 1);
            }}
            className="btn-primary"
          >
            {strings.afkResume}
          </button>
        </div>
      ) : (
        <UtteranceRecorder
          onRecorded={handleRecorded}
          onBeforeStart={player.unlock}
          disabled={status === 'sending'}
          sending={status === 'sending'}
          locale={locale}
          handsFree={handsFree}
          autoStartToken={autoStartToken}
          onAbandoned={() => {
            if (!handsFree) return;
            setAfkPaused(true);
            // Close the practice session too: an abandoned room is the end of the
            // session, and leaving it open would stretch it until the idle sweep.
            endSessionNow();
          }}
        />
      )}

      {status === 'idle' && (
        <p className="max-w-lg text-center text-xs text-ink-muted">
          {strings.correctionsHint}
          {handsFree ? ` ${strings.handsFreeHint}` : ''}
        </p>
      )}
      {status === 'sending' && (
        <p className="text-sm text-ink-muted" aria-live="polite">
          {strings.listeningBack}
        </p>
      )}
      {errorMessage && (
        <p className="text-sm font-semibold text-brand-700 dark:text-brand-300" aria-live="polite">
          {errorMessage}
        </p>
      )}

      {feedback && (
        <FeedbackCard
          expandErrors={correctMe}
          feedback={feedback}
          tutorAudioBase64={feedback.tutorAudioBase64}
          coachingProfile={coachingProfile}
          onReplay={() => feedback.tutorAudioBase64 && player.play(feedback.tutorAudioBase64)}
          locale={locale}
        />
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
