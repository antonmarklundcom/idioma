import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import {
  buildLessonPath,
  getCompletedLessonIds,
  getLessonsForPair,
  getTopicsForPair,
  nextLessonInPath,
  type LessonPathEntry,
} from '@/lib/lessons';
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

function matchesFilter(
  lesson: { level: CefrLevel; topic: string },
  level?: CefrLevel,
  topic?: string,
): boolean {
  return (!level || lesson.level === level) && (!topic || lesson.topic === topic);
}

// A row in a level section. "Later" lessons are dimmed, never locked (ROADMAP.md
// P0.1): an adult may jump ahead, so the link stays live and tappable.
function PathRow({ lesson, doneLabel }: { lesson: LessonPathEntry; doneLabel: string }) {
  return (
    <li>
      <Link
        href={`/lesson/${lesson.id}`}
        className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700 ${
          lesson.state === 'later' ? 'opacity-60' : ''
        }`}
      >
        <span className="flex flex-col">
          <span className="font-medium text-slate-900 dark:text-white">{lesson.title}</span>
          <span className="text-xs text-slate-400">
            {lesson.level} · {lesson.topic}
          </span>
        </span>
        {lesson.state === 'done' ? (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {doneLabel}
          </span>
        ) : (
          <span className="text-slate-400">→</span>
        )}
      </Link>
    </li>
  );
}

// PLAN.md §8 Phase 5 + ROADMAP.md P0.1: the lesson browser is a path, not a wall.
// Lessons group into level sections in the existing level→position→title order,
// the first uncompleted one is hoisted into a highlighted "Next up" card, and
// everything after it dims. All curriculum comes from the owner via
// /api/admin/content - never generated here, not even as a placeholder.
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

  // The path pointer is computed over the WHOLE pair, then the filter is applied
  // in memory - so narrowing to one level never moves what "Next up" means.
  const [allLessons, completed, topics, locale] = await Promise.all([
    getLessonsForPair(session.user.languagePairId),
    getCompletedLessonIds(session.user.id),
    getTopicsForPair(session.user.languagePairId),
    getUserLocale(session.user.id),
  ]);
  const strings = t(locale);

  const nextUp = nextLessonInPath(allLessons, completed);
  const lessons = allLessons.filter((lesson) => matchesFilter(lesson, level, topic));
  const path = buildLessonPath(lessons, completed, nextUp?.id ?? null);
  // Hoisted into its own card above the sections, so it is not listed twice.
  const heroLesson = nextUp && matchesFilter(nextUp, level, topic) ? nextUp : null;

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

      {heroLesson && (
        <Link
          href={`/lesson/${heroLesson.id}`}
          className="flex items-center justify-between gap-3 rounded-2xl border-2 border-indigo-500 bg-indigo-50 px-5 py-5 dark:border-indigo-500 dark:bg-indigo-950"
        >
          <span className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-300">
              {strings.lessons.nextUp}
            </span>
            <span className="text-lg font-bold text-indigo-900 dark:text-indigo-50">
              {heroLesson.title}
            </span>
            <span className="text-xs text-indigo-700 dark:text-indigo-300">
              {heroLesson.level} · {heroLesson.topic}
            </span>
          </span>
          <span className="text-2xl text-indigo-500">→</span>
        </Link>
      )}

      {lessons.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {strings.lessons.emptyBefore}{' '}
          <Link href="/lesson/practice" className="underline">
            {strings.lessons.emptyLink}
          </Link>{' '}
          {strings.lessons.emptyAfter}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {path.map((group) => {
            const rows = group.lessons.filter((lesson) => lesson.id !== heroLesson?.id);
            return (
              <section key={group.level} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {group.level}
                  </h2>
                  <span className="text-xs text-slate-400">
                    {strings.lessons.pathHint(group.doneCount, group.total)}
                  </span>
                </div>
                {rows.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {rows.map((lesson) => (
                      <PathRow key={lesson.id} lesson={lesson} doneLabel={strings.lessons.done} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
