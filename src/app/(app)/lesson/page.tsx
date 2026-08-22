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
import { EmptyState } from '@/components/ui/EmptyState';
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
        className={`card flex items-center justify-between gap-3 transition-transform active:scale-[0.99] ${
          lesson.state === 'later' ? 'opacity-55' : ''
        }`}
      >
        <span className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-base ${
              lesson.state === 'done'
                ? 'bg-success-100 dark:bg-success-500/20'
                : 'bg-surface-muted'
            }`}
          >
            {lesson.state === 'done' ? '✓' : '📘'}
          </span>
          <span className="flex flex-col">
            <span className="font-bold text-ink">{lesson.title}</span>
            <span className="text-xs font-semibold text-ink-muted">
              {lesson.level} · {lesson.topic}
            </span>
          </span>
        </span>
        {lesson.state === 'done' ? (
          <span className="text-xs font-bold text-success-600">{doneLabel}</span>
        ) : (
          <span aria-hidden="true" className="text-ink-muted">
            →
          </span>
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
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading-page">{strings.lessons.title}</h1>
        <Link href="/lesson/practice" className="btn-secondary btn-sm">
          {strings.lessons.freePractice}
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href={filterHref(undefined, topic)}
            className={`chip ${!level ? 'chip-active' : ''}`}
          >
            {strings.lessons.allLevels}
          </Link>
          {CEFR_LEVELS.map((l) => (
            <Link
              key={l}
              href={filterHref(l, topic)}
              className={`chip ${level === l ? 'chip-active' : ''}`}
            >
              {l}
            </Link>
          ))}
        </div>

        {topics.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={filterHref(level, undefined)}
              className={`chip ${!topic ? 'chip-active' : ''}`}
            >
              {strings.lessons.allTopics}
            </Link>
            {topics.map((t) => (
              <Link
                key={t}
                href={filterHref(level, t)}
                className={`chip ${topic === t ? 'chip-active' : ''}`}
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
          className="card-raised flex items-center justify-between gap-4 transition-transform active:scale-[0.99]"
        >
          <span className="flex flex-col gap-1">
            <span className="text-xs font-extrabold tracking-wide text-brand-700 uppercase dark:text-brand-300">
              {strings.lessons.nextUp}
            </span>
            <span className="text-xl font-extrabold text-ink">{heroLesson.title}</span>
            <span className="text-xs font-semibold text-ink-muted">
              {heroLesson.level} · {heroLesson.topic}
            </span>
          </span>
          <span aria-hidden="true" className="text-2xl text-brand-600 dark:text-brand-300">
            →
          </span>
        </Link>
      )}

      {lessons.length === 0 ? (
        <EmptyState emoji="📚">
          {strings.lessons.emptyBefore}{' '}
          <Link href="/lesson/practice" className="font-bold text-brand-600 underline">
            {strings.lessons.emptyLink}
          </Link>{' '}
          {strings.lessons.emptyAfter}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {path.map((group) => {
            const rows = group.lessons.filter((lesson) => lesson.id !== heroLesson?.id);
            return (
              <section key={group.level} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="heading-section">{group.level}</h2>
                  <span className="text-xs font-semibold text-ink-muted">
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
