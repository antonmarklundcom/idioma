import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getProgressData, getWeeklyRecap } from '@/lib/progress';
import { getPartnerStreak, getUserStatsSummary } from '@/lib/gamification';
import {
  getCompletedLessonIds,
  getLessonForPair,
  getLessonsForPair,
  nextLessonInPath,
  toPlayerExercises,
} from '@/lib/lessons';
import { getUserLocale } from '@/lib/getUserLocale';
import { TODAY_REVIEW_CAP, estimateTodayMinutes } from '@/lib/today';
import { t } from '@/lib/i18n';
import { estimateReviewMinutes } from '@/lib/srs';
import { ErrorPatternList } from '@/components/dashboard/ErrorPatternList';
import { SessionHistory } from '@/components/dashboard/SessionHistory';
import { WeeklyRecapCard } from '@/components/dashboard/WeeklyRecapCard';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="text-2xl font-extrabold text-ink">{value}</p>
    </div>
  );
}

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

  // ROADMAP.md P0.4: the button advertises the length of the session /today
  // actually builds, from the same inputs - the review count capped the same way,
  // and the real exercise count of the lesson it will serve. A button that
  // promises "~7 min" and delivers fifteen is the fastest way to lose the habit.
  const nextLessonRow =
    nextLesson && session?.user?.languagePairId
      ? await getLessonForPair(nextLesson.id, session.user.languagePairId)
      : null;
  const todayMinutes = estimateTodayMinutes({
    dueCount: Math.min(data?.dueReviewCount ?? 0, TODAY_REVIEW_CAP),
    exerciseCount: nextLessonRow ? toPlayerExercises(nextLessonRow.content).length : 0,
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8 sm:px-6 sm:py-10">
      <h1 className="heading-page">{strings.dashboard.welcomeBack(session?.user?.name ?? undefined)}</h1>

      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={strings.dashboard.xp} value={String(stats.xpTotal)} />
          <StatCard label={strings.dashboard.currentStreak} value={`🔥 ${stats.currentStreak}`} />
          <StatCard label={strings.dashboard.longestStreak} value={String(stats.longestStreak)} />
          <StatCard
            label={strings.dashboard.today}
            value={`${stats.turnsToday}/${stats.dailyGoalTarget}`}
          />
        </section>
      )}

      <Link href="/today" className="btn-primary w-full py-4 text-lg">
        {strings.dashboard.startTodaySession(todayMinutes)}
      </Link>

      {nextLesson && (
        <Link
          href={`/lesson/${nextLesson.id}`}
          className="card-raised flex items-center justify-between gap-4 transition-transform active:scale-[0.99]"
        >
          <span className="flex flex-col gap-1">
            <span className="text-xs font-extrabold tracking-wide text-brand-700 uppercase dark:text-brand-300">
              {strings.dashboard.continueLearning}
            </span>
            <span className="text-xl font-extrabold text-ink">{nextLesson.title}</span>
            <span className="text-xs font-semibold text-ink-muted">
              {nextLesson.level} · {nextLesson.topic}
            </span>
          </span>
          <span aria-hidden="true" className="text-2xl text-brand-600 dark:text-brand-300">
            →
          </span>
        </Link>
      )}

      {/* PLAN.md §13.1/§8: the guaranteed-short re-entry point on a busy day. Shown
          only when something is actually due - never a standing nag (§12.1). */}
      {data && data.dueReviewCount > 0 && (
        <Link
          href="/review"
          className="card flex items-center justify-between gap-3 bg-surface-muted transition-transform active:scale-[0.99]"
        >
          <span className="flex flex-col">
            <span className="font-bold text-ink">
              {strings.dashboard.reviewWaiting(
                data.dueReviewCount,
                estimateReviewMinutes(data.dueReviewCount),
              )}
            </span>
            <span className="text-xs text-ink-muted">{strings.dashboard.reviewSubtitle}</span>
          </span>
          <span aria-hidden="true" className="text-xl text-brand-600 dark:text-brand-300">
            →
          </span>
        </Link>
      )}

      {partner && (
        <p className="text-sm text-ink-muted">
          {strings.dashboard.partnerStreak(
            partner.name ?? strings.dashboard.partnerDefaultName,
            partner.currentStreak,
          )}
        </p>
      )}

      {recap && <WeeklyRecapCard recap={recap} locale={locale} />}

      <section className="flex flex-col gap-3">
        <h2 className="heading-section">{strings.dashboard.recurringMistakes}</h2>
        <ErrorPatternList patterns={data?.errorPatterns ?? []} locale={locale} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="heading-section">{strings.dashboard.practiceHistory}</h2>
        <SessionHistory sessions={data?.sessions ?? []} locale={locale} />
      </section>
    </div>
  );
}
