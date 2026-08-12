import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getLessonsForPair, getTopicsForPair } from '@/lib/lessons';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';
import type { CefrLevel } from '@/lib/db/schema';

const CEFR_LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

function isCefrLevel(value: string | undefined): value is CefrLevel {
  return value !== undefined && (CEFR_LEVELS as readonly string[]).includes(value);
}

function filterHref(level?: string, topic?: string): string {
  const params = new URLSearchParams();
  if (level) params.set('level', level);
  if (topic) params.set('topic', topic);
  const qs = params.toString();
  return qs ? `/lesson?${qs}` : '/lesson';
}

// PLAN.md §8 Phase 5: the real lesson browser in front of LessonPlayer. All
// curriculum comes from the owner via /api/admin/content - never generated
// here, not even as a placeholder. No content for the pair/filter = empty state.
export default async function LessonPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; topic?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/');
  if (!session.user.languagePairId) redirect('/onboarding');

  const { level: levelParam, topic: topicParam } = await searchParams;
  const level = isCefrLevel(levelParam) ? levelParam : undefined;
  const topic = topicParam && topicParam.trim().length > 0 ? topicParam : undefined;

  const [lessons, topics, locale] = await Promise.all([
    getLessonsForPair(session.user.languagePairId, { level, topic }),
    getTopicsForPair(session.user.languagePairId),
    getUserLocale(session.user.id),
  ]);
  const strings = t(locale);

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{strings.lessons.title}</h1>
        <Link
          href="/lesson/practice"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          {strings.lessons.freePractice}
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href={filterHref(undefined, topic)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !level
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {strings.lessons.allLevels}
          </Link>
          {CEFR_LEVELS.map((l) => (
            <Link
              key={l}
              href={filterHref(l, topic)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                level === l
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {l}
            </Link>
          ))}
        </div>

        {topics.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={filterHref(level, undefined)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                !topic
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {strings.lessons.allTopics}
            </Link>
            {topics.map((t) => (
              <Link
                key={t}
                href={filterHref(level, t)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  topic === t
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {t}
              </Link>
            ))}
          </div>
        )}
      </div>

      {lessons.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {strings.lessons.emptyBefore}{' '}
          <Link href="/lesson/practice" className="underline">
            {strings.lessons.emptyLink}
          </Link>{' '}
          {strings.lessons.emptyAfter}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <Link
                href={`/lesson/${lesson.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700"
              >
                <span className="flex flex-col">
                  <span className="font-medium text-slate-900 dark:text-white">{lesson.title}</span>
                  <span className="text-xs text-slate-400">
                    {lesson.level} · {lesson.topic}
                  </span>
                </span>
                <span className="text-slate-400">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
