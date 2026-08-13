import type { WeeklyRecap } from '@/lib/progress';
import { t, type Locale } from '@/lib/i18n';

// PLAN.md §8 Phase 8 / §12.2: turns spoken, practice days, top conquered mistake,
// XP vs last week - computed from usage_log + utterances only (lib/progress.ts).
export function WeeklyRecapCard({ recap, locale }: { recap: WeeklyRecap; locale: Locale }) {
  const strings = t(locale).weeklyRecap;

  if (recap.utterances === 0 && recap.xpThisWeek === 0 && recap.xpLastWeek === 0) {
    return (
      <section className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{strings.title}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{strings.empty}</p>
      </section>
    );
  }

  const xpDelta = recap.xpThisWeek - recap.xpLastWeek;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{strings.title}</h2>

      <div className="grid grid-cols-2 gap-2 text-sm text-slate-700 dark:text-slate-200 sm:grid-cols-4">
        <p>{strings.utterances(recap.utterances)}</p>
        <p>{strings.practiceDays(recap.practiceDays)}</p>
        <p
          className={
            xpDelta > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : xpDelta < 0
                ? 'text-slate-500 dark:text-slate-400'
                : ''
          }
        >
          {xpDelta > 0 ? strings.xpUp(xpDelta) : xpDelta < 0 ? strings.xpDown(xpDelta) : strings.xpFlat}
        </p>
        <p>
          {recap.topConqueredMistake ? (
            <>
              <span className="font-medium">{strings.topMistake}:</span>{' '}
              {recap.topConqueredMistake.description}
            </>
          ) : (
            strings.noMistakeConqueredYet
          )}
        </p>
      </div>
    </section>
  );
}
