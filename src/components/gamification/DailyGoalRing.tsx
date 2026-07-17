const SIZE = 32;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DailyGoalRing({
  turnsToday,
  dailyGoalTarget,
}: {
  turnsToday: number;
  dailyGoalTarget: number;
}) {
  const pct = dailyGoalTarget > 0 ? Math.min(1, turnsToday / dailyGoalTarget) : 0;
  const offset = CIRCUMFERENCE * (1 - pct);

  return (
    <div
      className="relative flex items-center justify-center"
      title={`${turnsToday}/${dailyGoalTarget} turns today`}
    >
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
          className="stroke-slate-200 dark:stroke-slate-700"
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
          className="stroke-sky-500 transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-[9px] font-medium text-slate-600 dark:text-slate-300">
        {turnsToday}/{dailyGoalTarget}
      </span>
    </div>
  );
}
