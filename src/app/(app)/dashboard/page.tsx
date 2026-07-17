import { auth } from '@/lib/auth';
import { getDashboardData } from '@/lib/progress';
import { ErrorPatternList } from '@/components/dashboard/ErrorPatternList';
import { SessionHistory } from '@/components/dashboard/SessionHistory';

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user;

  const data = user?.languagePairId
    ? await getDashboardData(user.id, user.languagePairId)
    : { errorPatterns: [], recentSessions: [] };

  return (
    <div className="flex flex-1 flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Welcome back{user?.name ? `, ${user.name}` : ''}!
      </h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Recurring mistakes
        </h2>
        <ErrorPatternList patterns={data.errorPatterns} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Recent practice
        </h2>
        <SessionHistory sessions={data.recentSessions} />
      </section>

      <p className="text-sm text-slate-400 dark:text-slate-500">
        Streaks, XP, and daily goals land here in Phase 4B.
      </p>
    </div>
  );
}
