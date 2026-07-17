export function StreakBadge({ currentStreak }: { currentStreak: number }) {
  if (currentStreak === 0) return null;

  return (
    <span
      className="flex items-center gap-1 text-sm font-medium text-orange-600 dark:text-orange-400"
      title={`${currentStreak}-day streak`}
    >
      🔥 {currentStreak}
    </span>
  );
}
