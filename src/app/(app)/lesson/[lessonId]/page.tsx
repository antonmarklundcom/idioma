import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getLessonForPair, toPlayerExercises } from '@/lib/lessons';
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
    <div className="flex flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">
          {lesson.level} · {lesson.topic}
        </p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{lesson.title}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">{content.intro}</p>
      </div>

      {content.vocab.length > 0 && (
        <ul className="flex flex-col gap-2">
          {content.vocab.map((v, i) => (
            <li
              key={i}
              className="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-700"
            >
              <p className="font-medium text-slate-900 dark:text-white">{v.term}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{v.gloss}</p>
              {v.note && <p className="mt-1 text-xs text-slate-400">{v.note}</p>}
            </li>
          ))}
        </ul>
      )}

      <LessonPlayer
        coachingProfile={session.user.coachingProfile ?? null}
        initialPrompt={initialPrompt}
        lessonId={lesson.id}
        exercises={exercises}
        locale={locale}
      />
    </div>
  );
}
