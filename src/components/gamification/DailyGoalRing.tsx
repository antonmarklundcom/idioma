import { t, type Locale } from '@/lib/i18n';

const SIZE = 38;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ROADMAP.md P0.3: the ring is one of the four "juicy" moments. It fills with a
// spring-ish transition as turns land, and pops once when the daily goal is met -
// both governed by the global prefers-reduced-motion rule in globals.css.
export function DailyGoalRing({
  turnsToday,
  dailyGoalTarget,
  locale,
}: {
  turnsToday: number;
  dailyGoalTarget: number;
  locale: Locale;
}) {
  const pct = dailyGoalTarget > 0 ? Math.min(1, turnsToday / dailyGoalTarget) : 0;
  const offset = CIRCUMFERENCE * (1 - pct);
  const complete = pct >= 1;
  const label = t(locale).gamification.turnsToday(turnsToday, dailyGoalTarget);

  return (
    <div
      className={`relative flex items-center justify-center ${complete ? 'animate-pop' : ''}`}
      title={label}
      role="img"
      aria-label={label}
    >
      <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden="true">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
          className="stroke-line"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className={`transition-[stroke-dashoffset] duration-700 ease-out ${
            complete ? 'stroke-success-500' : 'stroke-brand-500'
          }`}
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-ink" aria-hidden="true">
        {complete ? '✓' : turnsToday}
      </span>
    </div>
  );
}
