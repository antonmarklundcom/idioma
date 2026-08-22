import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import {
  buildLessonPath,
  completedFromMastery,
  formatTopic,
  getLessonMastery,
  getLessonsForPair,
  getTopicsForPair,
  nextLessonInPath,
  shakiestLesson,
  type LessonPathEntry,
  type MasteryState,
} from '@/lib/lessons';
import { EmptyState } from '@/components/ui/EmptyState';
import { getUserLocale } from '@/lib/getUserLocale';
import { t, type Locale } from '@/lib/i18n';
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

// ROADMAP.md P1.6: the four mastery states have to be distinguishable at a glance,
// which means a different mark AND a different word - a colour alone doesn't survive
// a sunny bus window, and 'done' vs 'done well' is the whole point of the state.
const MASTERY_MARK: Record<MasteryState, string> = {
  untouched: '📘',
  started: '▶️',
  completed: '✓',
  mastered: '⭐',
};

// Both finished states are success-tinted on purpose: the palette has exactly one
// "you got that right" colour (globals.css), and inventing a second one for mastery
// would put a new hue on the page to say something the ⭐ and the word already say.
function masteryBadge(mastery: MasteryState): string {
  return mastery === 'completed' || mastery === 'mastered'
    ? 'bg-success-100 dark:bg-success-500/20'
    : 'bg-surface-muted';
}

// A row in a level section. "Later" lessons are dimmed, never locked (ROADMAP.md
// P0.1): an adult may jump ahead, so the link stays live and tappable - and now
// SAYS so, because a dimmed card with only a grey arrow read as disabled.
function PathRow({ lesson, locale }: { lesson: LessonPathEntry; locale: Locale }) {
  const strings = t(locale).lessons;
  const action =
    lesson.mastery === 'started'
      ? strings.continueLesson
      : lesson.mastery === 'untouched'
        ? strings.start
        : strings.doAgain;
  return (
    <li>
      <Link
        href={`/lesson/${lesson.id}`}
        className={`card flex items-center justify-between gap-3 transition-transform active:scale-[0.99] ${
          lesson.state === 'later' ? 'opacity-75' : ''
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-base ${masteryBadge(
              lesson.mastery,
            )}`}
          >
            {MASTERY_MARK[lesson.mastery]}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-bold text-ink">{lesson.title}</span>
            <span className="truncate text-xs font-semibold text-ink-muted">
              {lesson.level} · {formatTopic(lesson.topic)}
              {lesson.mastery === 'mastered' && ` · ${strings.mastered}`}
              {lesson.mastery === 'started' && ` · ${strings.inProgress}`}
            </span>
          </span>
        </span>
        {/* A word, not a bare arrow: the complaint was that nothing on this page
            looked clickable. */}
        <span className="shrink-0 text-xs font-bold text-brand-600 dark:text-brand-300">
          {action} →
        </span>
      </Link>
    </li>
  );
}

// PLAN.md §8 Phase 5 + ROADMAP.md P0.1: the lesson browser is a path, not a wall.
// The 42 topic slugs used to sit unlabelled at the top of the page, raw
// ('asking-directions'), which read as a list of broken lessons rather than as
// filters - so they now live behind a closed disclosure, named, and humanized.
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
  const [allLessons, mastery, topics, locale] = await Promise.all([
    getLessonsForPair(session.user.languagePairId),
    // One query answers both questions: which lessons are finished, and how well
    // (ROADMAP.md P1.6). Nothing is stored for this - it is derived per request.
    getLessonMastery(session.user.id),
    getTopicsForPair(session.user.languagePairId),
    getUserLocale(session.user.id),
  ]);
  const strings = t(locale);
  const completed = completedFromMastery(mastery);

  const nextUp = nextLessonInPath(allLessons, completed);
  const lessons = allLessons.filter((lesson) => matchesFilter(lesson, level, topic));
  const path = buildLessonPath(lessons, completed, nextUp?.id ?? null, mastery);
  // The redo suggestion is computed over the WHOLE pair for the same reason the path
  // pointer is: a filter narrows what is listed, not what the learner is shaky at.
  const shakiest = shakiestLesson(allLessons, mastery);
  // Hoisted into its own card above the sections, so it is not listed twice.
  const heroLesson = nextUp && matchesFilter(nextUp, level, topic) ? nextUp : null;
  const filtering = Boolean(level || topic);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading-page">{strings.lessons.title}</h1>
        <Link href="/lesson/practice" className="btn-secondary btn-sm">
          {strings.lessons.freePractice}
        </Link>
      </div>

      {allLessons.length > 0 && (
        <p className="text-sm text-ink-muted">{strings.lessons.howItWorks}</p>
      )}

      {heroLesson && (
        <Link
          href={`/lesson/${heroLesson.id}`}
          className="card-raised flex items-center justify-between gap-4 transition-transform active:scale-[0.99]"
        >
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-extrabold tracking-wide text-brand-700 uppercase dark:text-brand-300">
              {strings.lessons.nextUp}
            </span>
            <span className="text-xl font-extrabold text-ink">{heroLesson.title}</span>
            <span className="text-xs font-semibold text-ink-muted">
              {heroLesson.level} · {formatTopic(heroLesson.topic)}
            </span>
          </span>
          <span className="btn-primary btn-sm shrink-0" aria-hidden="true">
            {strings.lessons.start}
          </span>
        </Link>
      )}

      {/* ROADMAP.md P1.6. Only appears once something has been completed WITHOUT being
          mastered, and never points at the lesson already hoisted above - two cards
          asking for the same tap is a worse page, not a more helpful one. */}
      {shakiest && shakiest.id !== heroLesson?.id && (
        <Link
          href={`/lesson/${shakiest.id}`}
          className="card flex items-center justify-between gap-4 transition-transform active:scale-[0.99]"
        >
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-extrabold tracking-wide text-ink-muted uppercase">
              {strings.lessons.redoShakiest}
            </span>
            <span className="font-bold text-ink">{shakiest.title}</span>
            <span className="text-xs text-ink-muted">{strings.lessons.redoShakiestHint}</span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-2xl">
            🔁
          </span>
        </Link>
      )}

      {/* Closed by default: with 42 topics this was most of the page, and it is
          the least important thing on it. Forced open when a filter is active, so
          the way back to the full list is always visible. */}
      {allLessons.length > 0 && (
        <details open={filtering} className="card">
          <summary className="cursor-pointer text-sm font-bold text-ink">
            {strings.lessons.filters}
          </summary>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
                {strings.lessons.levelFilter}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={filterHref(undefined, topic)}
                  className={`chip ${!level ? 'chip-active' : ''}`}
                >
                  {strings.lessons.allLevels}
                </Link>
                {CEFR_LEVELS.filter((l) => allLessons.some((lesson) => lesson.level === l)).map(
                  (l) => (
                    <Link
                      key={l}
                      href={filterHref(l, topic)}
                      className={`chip ${level === l ? 'chip-active' : ''}`}
                    >
                      {l}
                    </Link>
                  ),
                )}
              </div>
            </div>

            {topics.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
                  {strings.lessons.topicFilter}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={filterHref(level, undefined)}
                    className={`chip ${!topic ? 'chip-active' : ''}`}
                  >
                    {strings.lessons.allTopics}
                  </Link>
                  {topics.map((tp) => (
                    <Link
                      key={tp}
                      href={filterHref(level, tp)}
                      className={`chip ${topic === tp ? 'chip-active' : ''}`}
                    >
                      {formatTopic(tp)}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {filtering && (
              <Link href="/lesson" className="btn-secondary btn-sm self-start">
                {strings.lessons.clearFilters}
              </Link>
            )}
          </div>
        </details>
      )}

      {allLessons.length === 0 ? (
        <EmptyState emoji="📚">
          {strings.lessons.emptyBefore}{' '}
          <Link href="/lesson/practice" className="font-bold text-brand-600 underline">
            {strings.lessons.emptyLink}
          </Link>{' '}
          {strings.lessons.emptyAfter}
        </EmptyState>
      ) : lessons.length === 0 ? (
        // A filter that matches nothing is a different problem from a pair with no
        // curriculum, and the way out of it is a button, not free practice.
        <EmptyState emoji="🔍">
          <span className="flex flex-col items-center gap-3">
            {strings.lessons.noMatches}
            <Link href="/lesson" className="btn-secondary btn-sm">
              {strings.lessons.clearFilters}
            </Link>
          </span>
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
                      <PathRow key={lesson.id} lesson={lesson} locale={locale} />
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
