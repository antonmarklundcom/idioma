import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getProgressData, getWeeklyRecap } from '@/lib/progress';
import { getPartnerStreak, getUserStatsSummary } from '@/lib/gamification';
import { getCompletedLessonIds, getLessonsForPair, nextLessonInPath } from '@/lib/lessons';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';
import { estimateReviewMinutes } from '@/lib/srs';
import { ErrorPatternList } from '@/components/dashboard/ErrorPatternList';
import { SessionHistory } from '@/components/dashboard/SessionHistory';
import { WeeklyRecapCard } from '@/components/dashboard/WeeklyRecapCard';

export default async function DashboardPage() {
  const session = await auth();
  const data = session?.user
    ? await getProgressData(session.user.id, session.user.languagePairId)
    : null;
  const stats = session?.user
    ? await getUserStatsSummary(session.user.id, session.user.timezone)
    : null;
  const partner = session?.user ? await getPartnerStreak(session.user.id) : null;
  const recap = session?.user ? await getWeeklyRecap(session.user.id, session.user.timezone) : null;
  const locale = session?.user ? await getUserLocale(session.user.id) : 'en';
  const strings = t(locale);

  // ROADMAP.md P0.1: the same "Next up" pointer /lesson highlights, so the two
  // pages never disagree about where the learner left off. Derived at read time
  // from finished lesson sessions - no new table, no stored cursor.
  const nextLesson =
    session?.user && session.user.languagePairId
      ? nextLessonInPath(
          ...(await Promise.all([
            getLessonsForPair(session.user.languagePairId),
            getCompletedLessonIds(session.user.id),
          ])),
        )
      : null;

  return (
    <div className="flex flex-1 flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        {strings.dashboard.welcomeBack(session?.user?.name ?? undefined)}
      </h1>

      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs text-slate-400">{strings.dashboard.xp}</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-white">{stats.xpTotal}</p>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs text-slate-400">{strings.dashboard.currentStreak}</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-white">
              🔥 {stats.currentStreak}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs text-slate-400">{strings.dashboard.longestStreak}</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-white">
              {stats.longestStreak}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs text-slate-400">{strings.dashboard.today}</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-white">
              {stats.turnsToday}/{stats.dailyGoalTarget}
            </p>
          </div>
        </section>
      )}

      {nextLesson && (
        <Link
          href={`/lesson/${nextLesson.id}`}
          className="flex items-center justify-between gap-3 rounded-2xl border-2 border-indigo-500 bg-indigo-50 px-5 py-4 dark:border-indigo-500 dark:bg-indigo-950"
        >
          <span className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-300">
              {strings.dashboard.continueLearning}
            </span>
            <span className="text-lg font-bold text-indigo-900 dark:text-indigo-50">
              {nextLesson.title}
            </span>
            <span className="text-xs text-indigo-700 dark:text-indigo-300">
              {nextLesson.level} · {nextLesson.topic}
            </span>
          </span>
          <span className="text-2xl text-indigo-500">→</span>
        </Link>
      )}

      {/* PLAN.md §13.1/§8: the guaranteed-short re-entry point on a busy day. Shown
          only when something is actually due - never a standing nag (§12.1). */}
      {data && data.dueReviewCount > 0 && (
        <Link
          href="/review"
          className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950"
        >
          <span className="flex flex-col">
            <span className="font-medium text-indigo-900 dark:text-indigo-100">
              {strings.dashboard.reviewWaiting(
                data.dueReviewCount,
                estimateReviewMinutes(data.dueReviewCount),
              )}
            </span>
            <span className="text-xs text-indigo-700 dark:text-indigo-300">
              {strings.dashboard.reviewSubtitle}
            </span>
          </span>
          <span className="text-indigo-500">→</span>
        </Link>
      )}

      {partner && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {strings.dashboard.partnerStreak(
            partner.name ?? strings.dashboard.partnerDefaultName,
            partner.currentStreak,
          )}
        </p>
      )}

      {recap && <WeeklyRecapCard recap={recap} locale={locale} />}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {strings.dashboard.recurringMistakes}
        </h2>
        <ErrorPatternList patterns={data?.errorPatterns ?? []} locale={locale} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {strings.dashboard.practiceHistory}
        </h2>
        <SessionHistory sessions={data?.sessions ?? []} locale={locale} />
      </section>
    </div>
  );
}
