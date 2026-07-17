import { auth } from '@/lib/auth';
import { getProgressData } from '@/lib/progress';
import { getPartnerStreak, getUserStatsSummary } from '@/lib/gamification';
import { ErrorPatternList } from '@/components/dashboard/ErrorPatternList';
import { SessionHistory } from '@/components/dashboard/SessionHistory';

export default async function DashboardPage() {
  const session = await auth();
  const data = session?.user ? await getProgressData(session.user.id) : null;
  const stats = session?.user
    ? await getUserStatsSummary(session.user.id, session.user.timezone)
    : null;
  const partner = session?.user ? await getPartnerStreak(session.user.id) : null;

  return (
    <div className="flex flex-1 flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}!
      </h1>

      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs text-slate-400">XP</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-white">{stats.xpTotal}</p>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs text-slate-400">Current streak</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-white">
              🔥 {stats.currentStreak}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs text-slate-400">Longest streak</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-white">
              {stats.longestStreak}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs text-slate-400">Today</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-white">
              {stats.turnsToday}/{stats.dailyGoalTarget}
            </p>
          </div>
        </section>
      )}

      {partner && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {partner.name ?? 'Your partner'} is on a 🔥 {partner.currentStreak}-day streak.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Recurring mistakes
        </h2>
        <ErrorPatternList patterns={data?.errorPatterns ?? []} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Practice history
        </h2>
        <SessionHistory sessions={data?.sessions ?? []} />
      </section>
    </div>
  );
}
