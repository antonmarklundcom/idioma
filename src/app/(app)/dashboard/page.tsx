import { auth } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}!
      </h1>
      <p className="text-slate-500 dark:text-slate-400">
        Your progress dashboard, streaks, and recurring mistakes land here in Phase 4 / 4B.
        Lesson mode arrives in Phase 3.
      </p>
    </div>
  );
}
