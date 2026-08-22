import type { ProgressInsights } from '@/lib/progress';
import { t, type Locale } from '@/lib/i18n';

/**
 * "How is it going, and what should I fix?" - two questions, answered as one
 * comparison and a ranked list. Deliberately not a chart: eight sparse weekly
 * points on a phone tell a learner less than "fewer mistakes than last week,
 * and here are the three to work on".
 *
 * The headline is mistakes PER TURN. A raw mistake count punishes the learner
 * for talking more, which is the one behaviour this app exists to encourage.
 */
export function InsightsPanel({
  insights,
  locale,
}: {
  insights: ProgressInsights;
  locale: Locale;
}) {
  const strings = t(locale).insights;
  const { thisWeek, lastWeek, focusAreas, conquered } = insights;

  if (thisWeek.turns === 0 && lastWeek.turns === 0) {
    return (
      <section className="card flex flex-col gap-2">
        <h2 className="heading-section">{strings.title}</h2>
        <p className="text-sm text-ink-muted">{strings.noDataYet}</p>
      </section>
    );
  }

  const now = thisWeek.mistakesPerTurn;
  const before = lastWeek.mistakesPerTurn;
  // Only compare when both weeks actually have turns - otherwise "100% better"
  // just means the learner didn't practise last week.
  const change =
    now !== null && before !== null && before > 0 ? Math.round(((before - now) / before) * 100) : null;

  return (
    <section className="card flex flex-col gap-4">
      <h2 className="heading-section">{strings.title}</h2>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            {strings.accuracy}
          </p>
          <p className="text-3xl font-extrabold text-ink">
            {now === null ? '—' : now.toFixed(1)}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-ink">{strings.turnsThisWeek(thisWeek.turns)}</p>
          <p
            className={`text-sm font-bold ${
              change !== null && change > 0
                ? 'text-success-700 dark:text-success-500'
                : 'text-ink-muted'
            }`}
          >
            {change === null
              ? strings.noComparison
              : change > 0
                ? strings.better(change)
                : change < 0
                  ? strings.worse(Math.abs(change))
                  : strings.same}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {strings.workOnThis}
        </p>
        {focusAreas.length === 0 ? (
          <p className="text-sm text-ink-muted">{strings.nothingToFix}</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {focusAreas.map((p) => (
              <li key={p.id} className="flex items-start gap-2 text-sm text-ink">
                <span aria-hidden="true" className="text-ink-muted">
                  •
                </span>
                <span>
                  {p.description}{' '}
                  <span className="text-ink-muted">({p.occurrenceCount}×)</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {conquered.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            {strings.conquered}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {conquered.map((p) => (
              <li
                key={p.id}
                className="rounded-full bg-success-100 px-3 py-1 text-xs font-bold text-success-700 dark:bg-success-500/20 dark:text-success-500"
              >
                ✓ {p.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
