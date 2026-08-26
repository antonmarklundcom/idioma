'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { LessonPlayer } from '@/components/lesson/LessonPlayer';
import { ReviewSession } from '@/components/review/ReviewSession';
import { t, type Locale } from '@/lib/i18n';
import type { TodayStepKind } from '@/lib/today';
import type { CoachingProfile } from '@/lib/db/schema';
import type { PlayerExercise } from '@/lib/lessons';
import type { ReviewCard } from '@/types';

// ROADMAP.md P0.4: an orchestrator, not a new practice mode. Every step is run by
// the component that already owns it - ReviewSession grades reviews, LessonPlayer
// walks lesson exercises and the closing free turn - so there is exactly one
// grading path, the one that already existed. All this file adds is the order,
// a progress line, and the finish screen.
export function TodayFlow({
  minutes,
  steps,
  cards,
  lesson,
  freePracticePrompt,
  coachingProfile,
  currentStreak,
  locale,
}: {
  /** The session's advertised length, shown while it is still ahead of you. */
  minutes: number;
  steps: TodayStepKind[];
  cards: ReviewCard[];
  lesson: { id: string; title: string; exercises: PlayerExercise[] } | null;
  freePracticePrompt: string;
  coachingProfile: CoachingProfile | null;
  currentStreak: number;
  locale: Locale;
}) {
  const strings = t(locale).today;
  const [stepIndex, setStepIndex] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);

  const advance = useCallback((xp: number) => {
    setXpEarned((total) => total + xp);
    setStepIndex((i) => i + 1);
  }, []);

  const step = steps[stepIndex];

  if (!step) {
    return (
      <div className="flex flex-1 flex-col items-center gap-4 px-5 py-12 text-center sm:px-6">
        <span aria-hidden="true" className="animate-pop text-6xl">
          🎉
        </span>
        <h1 className="heading-page">{strings.finishTitle}</h1>
        {xpEarned > 0 && (
          <p className="animate-pop rounded-full bg-success-100 px-4 py-1.5 text-sm font-extrabold text-success-700 dark:bg-success-500/20 dark:text-success-500">
            {strings.finishXp(xpEarned)}
          </p>
        )}
        {currentStreak > 0 && (
          <p className="text-sm font-bold text-streak-700 dark:text-streak-500">
            {strings.finishStreak(currentStreak)}
          </p>
        )}
        <p className="max-w-sm text-sm text-ink-muted">{strings.seeYouTomorrow}</p>
        <Link href="/dashboard" className="btn-primary">
          {strings.backToDashboard}
        </Link>
      </div>
    );
  }

  const stepLabel =
    step === 'review' ? strings.stepReview : step === 'lesson' ? strings.stepLesson : strings.stepSpeak;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-5 pt-8 sm:px-6 sm:pt-10">
        <div>
          <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
            {strings.stepOf(stepIndex + 1, steps.length)}
          </p>
          <h1 className="heading-section">{stepLabel}</h1>
        </div>
        {/* Nobody should be trapped in a step they can't finish - a broken mic, a
            lesson they'd rather not do now. Skipping keeps the session moving. */}
        <button
          type="button"
          onClick={() => advance(0)}
          className="cursor-pointer text-sm font-semibold text-ink-muted underline"
        >
          {strings.skipStep}
        </button>
      </div>

      {/* What the session is, said once, on the way in. Repeating it over step
          three would be nagging, and over the finish screen it was wrong. */}
      {stepIndex === 0 && (
        <p className="mx-auto w-full max-w-2xl px-5 pt-2 text-sm text-ink-muted sm:px-6">
          {strings.subtitle(minutes)}
        </p>
      )}

      {step === 'review' && (
        <ReviewSession
          key="review"
          cards={cards}
          coachingProfile={coachingProfile}
          locale={locale}
          onFinished={advance}
        />
      )}

      {step === 'lesson' && lesson && (
        <LessonPlayer
          key={`lesson-${lesson.id}`}
          coachingProfile={coachingProfile}
          initialPrompt={lesson.exercises[0]?.prompt ?? lesson.title}
          lessonId={lesson.id}
          exercises={lesson.exercises}
          locale={locale}
          onFinished={advance}
        />
      )}

      {step === 'speak' && (
        <>
          <p className="mx-auto w-full max-w-2xl px-5 pt-4 text-sm text-ink-muted sm:px-6">
            {strings.speakIntro}
          </p>
          <LessonPlayer
            key="speak"
            coachingProfile={coachingProfile}
            initialPrompt={freePracticePrompt}
            locale={locale}
            turnLimit={1}
            finishLabel={strings.continue}
            onFinished={advance}
          />
        </>
      )}
    </div>
  );
}
