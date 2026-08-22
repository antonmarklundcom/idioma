import { EmptyState } from '@/components/ui/EmptyState';
import type { ErrorPatternWithFlag } from '@/lib/progress';
import { t, type Locale } from '@/lib/i18n';

const CATEGORY_STYLES: Record<string, string> = {
  pronunciation:
    'border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-200',
  grammar:
    'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200',
  vocab:
    'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200',
};

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// PLAN.md §4: ranked recurring mistakes, per-category badges, first/last seen,
// example quote. Patterns dormant 14+ days with 3+ occurrences render "conquered".
export function ErrorPatternList({
  patterns,
  locale,
}: {
  patterns: ErrorPatternWithFlag[];
  locale: Locale;
}) {
  const strings = t(locale);
  if (patterns.length === 0) {
    return <EmptyState emoji="🌱">{strings.dashboardComponents.noMistakesYet}</EmptyState>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {patterns.map((p) => (
        <li
          key={p.id}
          className={`rounded-2xl border-2 px-4 py-3 text-sm ${
            p.conquered
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
              : (CATEGORY_STYLES[p.category] ?? 'border-line bg-surface text-ink')
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium uppercase tracking-wide dark:bg-white/10">
              {p.category}
            </span>
            <span className="text-xs opacity-70">
              {p.occurrenceCount}× · {formatDate(p.firstSeenAt)}–{formatDate(p.lastSeenAt)}
            </span>
          </div>
          <p className="mt-2">{p.description}</p>
          {p.exampleQuote && (
            <p className="mt-1 italic opacity-70">&ldquo;{p.exampleQuote}&rdquo;</p>
          )}
          {p.conquered && (
            <p className="mt-1 text-xs font-medium">{strings.dashboardComponents.conquered}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
