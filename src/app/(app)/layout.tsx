import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';
import { getUserStatsSummary } from '@/lib/gamification';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';
import { DailyGoalRing } from '@/components/gamification/DailyGoalRing';
import { StreakBadge } from '@/components/gamification/StreakBadge';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/');
  }

  const [stats, locale] = await Promise.all([
    getUserStatsSummary(session.user.id, session.user.timezone),
    getUserLocale(session.user.id),
  ]);
  const strings = t(locale);

  return (
    <div className="flex min-h-screen flex-col">
      {/* PLAN.md §8 mobile audit: safe-area padding so the header clears the iOS
          notch/status bar in the installed PWA (viewportFit: 'cover' runs the app
          edge-to-edge, §7.1); nav wraps and gains bigger tap targets below sm. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6 sm:py-4 sm:pt-4 dark:border-slate-800">
        <Link href="/dashboard" className="py-1 font-semibold text-slate-900 dark:text-white">
          {strings.nav.brand}
        </Link>
        <nav className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
          <DailyGoalRing
            turnsToday={stats.turnsToday}
            dailyGoalTarget={stats.dailyGoalTarget}
            locale={locale}
          />
          <StreakBadge currentStreak={stats.currentStreak} locale={locale} />
          <Link className="min-h-11 rounded-lg px-2 py-2.5" href="/dashboard">
            {strings.nav.dashboard}
          </Link>
          <Link className="min-h-11 rounded-lg px-2 py-2.5" href="/lesson">
            {strings.nav.lessons}
          </Link>
          <Link className="min-h-11 rounded-lg px-2 py-2.5" href="/review">
            {strings.nav.review}
          </Link>
          <Link className="min-h-11 rounded-lg px-2 py-2.5" href="/live">
            {strings.nav.live}
          </Link>
          <Link className="min-h-11 rounded-lg px-2 py-2.5" href="/settings">
            {strings.nav.settings}
          </Link>
          {session.user.role === 'admin' && (
            <Link className="min-h-11 rounded-lg px-2 py-2.5" href="/admin">
              {strings.nav.admin}
            </Link>
          )}
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button
              type="submit"
              className="min-h-11 rounded-lg px-2 py-2.5 text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              {strings.nav.signOut}
            </button>
          </form>
        </nav>
      </header>
      <main className="flex flex-1 flex-col pb-[env(safe-area-inset-bottom)]">{children}</main>
    </div>
  );
}
