import type { AdminUsageSummary } from '@/lib/usage';

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

function barColor(percent: number): string {
  if (percent >= 100) return 'bg-red-500';
  if (percent >= 80) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// `stopAt`, when given, is the point where the app itself stops spending the allotment
// (PLAN.md §16 defect 2) - so the amber flag means "about to stop", not just "getting
// close to Google's number", and the bar shows where that line sits.
function CapBar({
  label,
  value,
  cap,
  unit,
  stopAt,
}: {
  label: string;
  value: number;
  cap: number;
  unit: string;
  stopAt?: number;
}) {
  const percent = pct(value, cap);
  const percentOfLimit = pct(value, stopAt ?? cap);
  const flagged = percentOfLimit >= 80;
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">{label}</p>
        {flagged && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {percentOfLimit >= 100 ? 'over cap' : `${percentOfLimit}% of cap`}
          </span>
        )}
      </div>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
        {value.toLocaleString()} / {cap.toLocaleString()} {unit}
      </p>
      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${barColor(percentOfLimit)}`}
          style={{ width: `${percent}%` }}
        />
        {stopAt !== undefined && (
          <div
            className="absolute inset-y-0 w-px bg-slate-500 dark:bg-slate-300"
            style={{ left: `${pct(stopAt, cap)}%` }}
          />
        )}
      </div>
      {stopAt !== undefined && (
        <p className="mt-2 text-xs text-slate-400">
          {value >= stopAt
            ? `Synthesis paused — resumes on the 1st (UTC). Replies stay text-only until then.`
            : `Synthesis auto-pauses at ${stopAt.toLocaleString()} to stay inside the free allotment.`}
        </p>
      )}
    </div>
  );
}

function DailyBars({
  series,
  pick,
  label,
}: {
  series: AdminUsageSummary['dailySeries'];
  pick: (p: AdminUsageSummary['dailySeries'][number]) => number;
  label: string;
}) {
  const max = Math.max(1, ...series.map(pick));
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <p className="mb-3 text-xs text-slate-400">{label} — last 14 days (UTC)</p>
      <div className="flex h-24 items-end gap-1">
        {series.map((point) => {
          const value = pick(point);
          const height = Math.max(2, Math.round((value / max) * 100));
          return (
            <div key={point.date} className="group relative flex-1">
              <div
                className="w-full rounded-t bg-indigo-400 dark:bg-indigo-500"
                style={{ height: `${height}%` }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block dark:bg-slate-700">
                {point.date}: {value.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UsagePanel({ usage }: { usage: AdminUsageSummary }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
        Usage &amp; free-tier caps
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Early-warning system for the free-tier caps (PLAN.md §6.5) — read-only, changes nothing.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CapBar
          label="Cloud TTS characters this month (global)"
          value={usage.monthlyTtsCharCount}
          cap={usage.monthlyTtsCharCap}
          stopAt={usage.monthlyTtsCharStop}
          unit="characters"
        />
        <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
          <p className="text-xs text-slate-400">Lesson attempts today, per user</p>
          <ul className="mt-2 flex flex-col gap-1">
            {usage.perUserToday.length === 0 && (
              <li className="text-sm text-slate-400">No attempts yet today.</li>
            )}
            {usage.perUserToday.map((u) => {
              const percent = pct(u.lessonAttemptsToday, usage.dailyLessonAttemptCap);
              const flagged = percent >= 80;
              return (
                <li
                  key={u.userId}
                  className="flex items-center justify-between gap-2 text-sm text-slate-700 dark:text-slate-300"
                >
                  <span className="truncate">{u.name ? `${u.name} · ${u.email}` : u.email}</span>
                  <span
                    className={
                      flagged
                        ? 'font-semibold text-amber-600 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }
                  >
                    {u.lessonAttemptsToday} / {usage.dailyLessonAttemptCap}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DailyBars
          series={usage.dailySeries}
          pick={(p) => p.lessonAttempts}
          label="Lesson attempts"
        />
        <DailyBars series={usage.dailySeries} pick={(p) => p.ttsChars} label="TTS characters" />
      </div>

      {/* What the family kept getting wrong with nothing in the curriculum to
          practise it - automatic detection plus explicit "I want practice on this"
          requests, ranked. This is the brief for the next content pack. */}
      <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
        <p className="text-xs text-slate-400">Content gaps — mistakes with nothing to drill</p>
        {usage.contentGaps.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            None recorded. Every recurring mistake has something that practises it.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {usage.contentGaps.map((gap) => (
              <li
                key={gap.patternKey}
                className="flex items-center justify-between gap-2 text-sm text-slate-700 dark:text-slate-300"
              >
                <span className="truncate font-mono text-xs">{gap.patternKey}</span>
                <span className="shrink-0 text-slate-500 dark:text-slate-400">
                  {gap.requests}× · {gap.learners} learner{gap.learners === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
