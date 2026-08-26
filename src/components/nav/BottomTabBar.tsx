'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t, type Locale } from '@/lib/i18n';

// ROADMAP.md P0.3: the app is used as a phone PWA, so the four things you
// actually do live in a thumb-reachable bar instead of a wrapping row of text
// links in the header. Desktop keeps the header nav (this is `sm:hidden`).
//
// The first tab is /today, not /dashboard: P0.4 made the guided session the
// post-login landing but shipped after this bar, so the one button the whole
// roadmap is built around was the one screen with no way back to it. The
// dashboard is a read-out rather than a thing you do, so it moves to the
// header's icon row beside settings.
const TABS = [
  { href: '/today', icon: '🎯', key: 'today' },
  { href: '/lesson', icon: '📚', key: 'lessons' },
  { href: '/review', icon: '🔁', key: 'review' },
  { href: '/live', icon: '🎤', key: 'live' },
] as const;

export function BottomTabBar({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const strings = t(locale).nav;

  return (
    <nav
      aria-label={strings.brand}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map((tab) => {
          // /lesson/[id] and /lesson/practice are still "Lessons".
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors ${
                  active ? 'text-brand-600 dark:text-brand-300' : 'text-ink-muted'
                }`}
              >
                <span aria-hidden="true" className={`text-xl ${active ? 'animate-pop' : ''}`}>
                  {tab.icon}
                </span>
                {strings[tab.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
