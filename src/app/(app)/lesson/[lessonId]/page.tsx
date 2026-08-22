import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { formatTopic, getLessonForPair, toPlayerExercises } from '@/lib/lessons';
import { getUserLocale } from '@/lib/getUserLocale';
import { LessonPlayer } from '@/components/lesson/LessonPlayer';
import type { LessonContent } from '@/lib/zodSchemas';

// PLAN.md §3.4/§8: the browser stops here - LessonPlayer owns the record-feedback
// loop. This page shows the lesson's intro/vocab and hands the player the lesson's
// exercises to walk through (Phase 5B); exercise types the player doesn't know are
// dropped by toPlayerExercises, and a `listen_prompt`'s audioText never leaves the
// server - the player fetches it as audio.
export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/');
  if (!session.user.languagePairId) redirect('/onboarding');

  const { lessonId } = await params;
  const [lesson, locale] = await Promise.all([
    getLessonForPair(lessonId, session.user.languagePairId),
    getUserLocale(session.user.id),
  ]);
  if (!lesson) notFound();

  const content = lesson.content as LessonContent;
  const exercises = toPlayerExercises(lesson.content);
  // Only used if the lesson has no exercise the player recognizes: it then falls
  // back to the free-practice loop rather than showing the learner a dead end.
  const initialPrompt = exercises[0]?.prompt ?? content.intro;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10">
      <div>
        <p className="text-xs font-extrabold tracking-wide text-brand-600 uppercase dark:text-brand-300">
          {lesson.level} · {formatTopic(lesson.topic)}
        </p>
        <h1 className="heading-page mt-1">{lesson.title}</h1>
        <p className="mt-2 text-ink-muted">{content.intro}</p>
      </div>

      {/* The vocab list used to sit here as a static wall above the recorder. It is now
          the player's first STEP instead (ROADMAP.md P1.5) - same words, but audible,
          and the exercises don't start until the learner says they are ready. */}
      <LessonPlayer
        coachingProfile={session.user.coachingProfile ?? null}
        initialPrompt={initialPrompt}
        lessonId={lesson.id}
        exercises={exercises}
        vocab={content.vocab}
        locale={locale}
      />
    </div>
  );
}
