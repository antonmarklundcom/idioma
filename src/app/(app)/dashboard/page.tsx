import { auth } from '@/lib/auth';
import { getProgressData } from '@/lib/progress';
import { ErrorPatternList } from '@/components/dashboard/ErrorPatternList';
import { SessionHistory } from '@/components/dashboard/SessionHistory';

export default async function DashboardPage() {
  const session = await auth();
  const data = session?.user ? await getProgressData(session.user.id) : null;

  return (
    <div className="flex flex-1 flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}!
      </h1>

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

      <p className="text-sm text-slate-400 dark:text-slate-500">
        Streaks, XP, and daily goals arrive in Phase 4B.
      </p>
    </div>
  );
}
