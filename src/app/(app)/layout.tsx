import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';
import { getUserStatsSummary } from '@/lib/gamification';
import { DailyGoalRing } from '@/components/gamification/DailyGoalRing';
import { StreakBadge } from '@/components/gamification/StreakBadge';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/');
  }

  const stats = await getUserStatsSummary(session.user.id, session.user.timezone);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <Link href="/dashboard" className="font-semibold text-slate-900 dark:text-white">
          🗣️ Idioma
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
          <DailyGoalRing turnsToday={stats.turnsToday} dailyGoalTarget={stats.dailyGoalTarget} />
          <StreakBadge currentStreak={stats.currentStreak} />
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/lesson">Lessons</Link>
          <Link href="/review">Review</Link>
          <Link href="/live">Live</Link>
          <Link href="/settings">Settings</Link>
          {session.user.role === 'admin' && <Link href="/admin">Admin</Link>}
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button type="submit" className="text-slate-500 hover:text-slate-800 dark:hover:text-white">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
