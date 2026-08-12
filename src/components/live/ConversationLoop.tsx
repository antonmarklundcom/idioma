'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UtteranceRecorder } from '@/components/recorder/UtteranceRecorder';
import { useSessionEndBeacon } from '@/components/practice/useSessionEndBeacon';
import { FeedbackCard } from '@/components/lesson/FeedbackCard';
import { useTutorAudioPlayer } from '@/components/lesson/useTutorAudioPlayer';
import { XpToast } from '@/components/gamification/XpToast';
import { Celebration } from '@/components/gamification/Celebration';
import type { CoachingProfile } from '@/lib/db/schema';
import type { LessonAttemptResponse } from '@/types';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const OPENING_PROMPT = "Say hi and tell your tutor what's on your mind today - anything goes.";

// PLAN.md §4.3: the $0 turn-based conversation loop. A thin wrapper around the same
// /api/lesson/attempt pipeline as lesson mode (mode: 'live', no lessonId) - walkie-talkie
// style back-and-forth instead of a fixed exercise. No new API routes, no ephemeral
// tokens, no true real-time voice (that's the documented-but-deferred §4.2 upgrade).
export function ConversationLoop({ coachingProfile }: { coachingProfile: CoachingProfile | null }) {
  const router = useRouter();
  const [promptContext, setPromptContext] = useState(OPENING_PROMPT);
  const [feedback, setFeedback] = useState<LessonAttemptResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [xpEvent, setXpEvent] = useState<{ id: number; xp: number } | null>(null);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(null);
  const player = useTutorAudioPlayer();
  // PLAN.md §16 defect 1: closes the practice_sessions row when the learner leaves.
  const { markTurnRecorded } = useSessionEndBeacon('live');

  const handleRecorded = useCallback(
    async (blob: Blob, mimeType: string) => {
      setStatus('sending');
      setErrorMessage(null);
      try {
        const audioBase64 = await blobToBase64(blob);
        const res = await fetch('/api/lesson/attempt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64, mimeType, mode: 'live', promptContext }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrorMessage(data.error ?? "Couldn't analyze that recording. Try again.");
          setStatus('error');
          return;
        }
        const data: LessonAttemptResponse = await res.json();
        markTurnRecorded();
        setFeedback(data);
        setPromptContext(data.followUpQuestion);
        setTurnCount((n) => n + 1);
        setStatus('idle');
        if (data.tutorAudioBase64) player.play(data.tutorAudioBase64);

        setXpEvent({ id: Date.now(), xp: data.gamification.xpAwarded });
        if (data.gamification.celebration?.type === 'streak_milestone') {
          setCelebrationMessage(`🔥 ${data.gamification.celebration.milestone}-day streak!`);
        }
        router.refresh();
      } catch {
        setErrorMessage('Network error - please try again.');
        setStatus('error');
      }
    },
    [promptContext, player, router, markTurnRecorded],
  );

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-6 py-10">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        Turn {turnCount + 1} · free conversation
      </p>
      <p className="max-w-lg text-center text-lg text-slate-700 dark:text-slate-200">
        {promptContext}
      </p>

      <UtteranceRecorder
        onRecorded={handleRecorded}
        onBeforeStart={player.unlock}
        disabled={status === 'sending'}
      />

      {status === 'sending' && <p className="text-sm text-slate-400">Listening back…</p>}
      {errorMessage && <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>}

      {feedback && (
        <FeedbackCard
          feedback={feedback}
          tutorAudioBase64={feedback.tutorAudioBase64}
          coachingProfile={coachingProfile}
          onReplay={() => feedback.tutorAudioBase64 && player.play(feedback.tutorAudioBase64)}
        />
      )}

      {xpEvent && (
        <XpToast key={xpEvent.id} xpAwarded={xpEvent.xp} onDismiss={() => setXpEvent(null)} />
      )}
      {celebrationMessage && (
        <Celebration message={celebrationMessage} onDismiss={() => setCelebrationMessage(null)} />
      )}
    </div>
  );
}
