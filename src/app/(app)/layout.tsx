import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';
import { getUserStatsSummary } from '@/lib/gamification';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';
import { BottomTabBar } from '@/components/nav/BottomTabBar';
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
          edge-to-edge, §7.1). ROADMAP.md P0.3: below sm the header keeps only the
          brand and the two progress read-outs - navigation moves to the bottom
          tab bar, where a thumb can reach it. */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface/90 px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur sm:px-6 sm:py-4 sm:pt-4">
        <Link href="/today" className="py-1 text-lg font-extrabold tracking-tight text-ink">
          {strings.nav.brand}
        </Link>
        <nav className="flex items-center gap-x-1 text-sm text-ink-muted">
          <DailyGoalRing
            turnsToday={stats.turnsToday}
            dailyGoalTarget={stats.dailyGoalTarget}
            locale={locale}
          />
          <StreakBadge currentStreak={stats.currentStreak} locale={locale} />
          <span className="hidden items-center gap-x-1 sm:flex">
            <Link className="min-h-11 rounded-xl px-2 py-2.5 font-semibold hover:text-brand-600" href="/today">
              {strings.nav.today}
            </Link>
            <Link className="min-h-11 rounded-xl px-2 py-2.5 font-semibold hover:text-brand-600" href="/dashboard">
              {strings.nav.dashboard}
            </Link>
            <Link className="min-h-11 rounded-xl px-2 py-2.5 font-semibold hover:text-brand-600" href="/lesson">
              {strings.nav.lessons}
            </Link>
            <Link className="min-h-11 rounded-xl px-2 py-2.5 font-semibold hover:text-brand-600" href="/review">
              {strings.nav.review}
            </Link>
            <Link className="min-h-11 rounded-xl px-2 py-2.5 font-semibold hover:text-brand-600" href="/live">
              {strings.nav.live}
            </Link>
            <Link
              className="min-h-11 rounded-xl px-2 py-2.5 font-semibold hover:text-brand-600"
              href="/history"
            >
              {strings.nav.history}
            </Link>
          </span>
          {/* Icon-only below sm so the compact header still fits the ring, the
              flame and a way into settings; sign-out lives on that page for
              phones, where the header has no room for it. The dashboard joins
              them on phones: it left the tab bar to make room for /today, and a
              screen reachable only by guessing that the brand is a link is not
              reachable. */}
          <Link
            className="min-h-11 rounded-xl px-2 py-2.5 font-semibold hover:text-brand-600 sm:hidden"
            href="/dashboard"
            aria-label={strings.nav.dashboard}
          >
            <span aria-hidden="true">📊</span>
          </Link>
          <Link
            className="min-h-11 rounded-xl px-2 py-2.5 font-semibold hover:text-brand-600"
            href="/settings"
            aria-label={strings.nav.settings}
          >
            <span aria-hidden="true" className="sm:hidden">
              ⚙️
            </span>
            <span className="hidden sm:inline">{strings.nav.settings}</span>
          </Link>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button
              type="submit"
              className="hidden min-h-11 cursor-pointer rounded-xl px-2 py-2.5 font-semibold hover:text-brand-600 sm:block"
            >
              {strings.nav.signOut}
            </button>
          </form>
        </nav>
      </header>
      {/* The bottom bar is fixed, so the last card on a page needs room to clear it. */}
      <main className="flex flex-1 flex-col pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>
      <BottomTabBar locale={locale} />
    </div>
  );
}
