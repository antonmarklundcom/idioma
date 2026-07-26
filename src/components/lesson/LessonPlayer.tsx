'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UtteranceRecorder } from '@/components/recorder/UtteranceRecorder';
import { FeedbackCard } from './FeedbackCard';
import { useTutorAudioPlayer } from './useTutorAudioPlayer';
import { useSessionEndBeacon } from '@/components/recorder/useSessionEndBeacon';
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

// PLAN.md §2/§3.4: chains follow-up questions into a continuing session - each
// turn's followUpQuestion becomes the next turn's promptContext. Free-practice mode
// (no lessonId) starts from one "talk about anything" prompt.
export function LessonPlayer({
  coachingProfile,
  initialPrompt,
  lessonId,
}: {
  coachingProfile: CoachingProfile | null;
  initialPrompt: string;
  lessonId?: string;
}) {
  const router = useRouter();
  const [promptContext, setPromptContext] = useState(initialPrompt);
  const [feedback, setFeedback] = useState<LessonAttemptResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [xpEvent, setXpEvent] = useState<{ id: number; xp: number } | null>(null);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(null);
  const player = useTutorAudioPlayer();
  useSessionEndBeacon();

  const handleRecorded = useCallback(
    async (blob: Blob, mimeType: string) => {
      setStatus('sending');
      setErrorMessage(null);
      try {
        const audioBase64 = await blobToBase64(blob);
        const res = await fetch('/api/lesson/attempt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64, mimeType, lessonId, promptContext }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrorMessage(data.error ?? "Couldn't analyze that recording. Try again.");
          setStatus('error');
          return;
        }
        const data: LessonAttemptResponse = await res.json();
        setFeedback(data);
        setPromptContext(data.followUpQuestion);
        setStatus('idle');
        if (data.tutorAudioBase64) player.play(data.tutorAudioBase64);

        // PLAN.md §12.2: XP toast after every turn; a short celebration on streak
        // milestones. (Lesson-completion celebrations activate in Phase 5, once real
        // lesson content gives free practice a completion event to hook.)
        setXpEvent({ id: Date.now(), xp: data.gamification.xpAwarded });
        if (data.gamification.celebration?.type === 'streak_milestone') {
          setCelebrationMessage(`🔥 ${data.gamification.celebration.milestone}-day streak!`);
        }
        router.refresh(); // updates the app-shell header's DailyGoalRing/StreakBadge
      } catch {
        setErrorMessage('Network error - please try again.');
        setStatus('error');
      }
    },
    [lessonId, promptContext, player, router],
  );

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-6 py-10">
      <p className="max-w-lg text-center text-lg text-slate-700 dark:text-slate-200">
        {promptContext}
      </p>

      <UtteranceRecorder
        onRecorded={handleRecorded}
        onBeforeStart={player.unlock}
        disabled={status === 'sending'}
      />

      {status === 'sending' && <p className="text-sm text-slate-400">Analyzing your recording…</p>}
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
