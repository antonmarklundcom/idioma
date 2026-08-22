import { t, type Locale } from '@/lib/i18n';

export function StreakBadge({
  currentStreak,
  locale,
}: {
  currentStreak: number;
  locale: Locale;
}) {
  if (currentStreak === 0) return null;

  const label = t(locale).gamification.dayStreak(currentStreak);

  return (
    <span
      className="flex items-center gap-1 rounded-full bg-streak-50 px-2.5 py-1 text-sm font-bold text-streak-700 dark:bg-streak-500/15 dark:text-streak-500"
      title={label}
      aria-label={label}
    >
      {/* The flame is the only thing that loops - slowly, and stilled entirely
          under prefers-reduced-motion. */}
      <span aria-hidden="true" className="animate-flame">
        🔥
      </span>
      {currentStreak}
    </span>
  );
}
