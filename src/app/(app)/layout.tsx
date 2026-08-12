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
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <Link href="/dashboard" className="font-semibold text-slate-900 dark:text-white">
          {strings.nav.brand}
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
          <DailyGoalRing
            turnsToday={stats.turnsToday}
            dailyGoalTarget={stats.dailyGoalTarget}
            locale={locale}
          />
          <StreakBadge currentStreak={stats.currentStreak} locale={locale} />
          <Link href="/dashboard">{strings.nav.dashboard}</Link>
          <Link href="/lesson">{strings.nav.lessons}</Link>
          <Link href="/review">{strings.nav.review}</Link>
          <Link href="/live">{strings.nav.live}</Link>
          <Link href="/settings">{strings.nav.settings}</Link>
          {session.user.role === 'admin' && <Link href="/admin">{strings.nav.admin}</Link>}
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button type="submit" className="text-slate-500 hover:text-slate-800 dark:hover:text-white">
              {strings.nav.signOut}
            </button>
          </form>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
