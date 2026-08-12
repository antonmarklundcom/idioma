import { t, type Locale } from '@/lib/i18n';

export function StreakBadge({
  currentStreak,
  locale,
}: {
  currentStreak: number;
  locale: Locale;
}) {
  if (currentStreak === 0) return null;

  return (
    <span
      className="flex items-center gap-1 text-sm font-medium text-orange-600 dark:text-orange-400"
      title={t(locale).gamification.dayStreak(currentStreak)}
    >
      🔥 {currentStreak}
    </span>
  );
}
