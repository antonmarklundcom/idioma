import type { RankedErrorPattern } from '@/lib/errorPatterns';

const CATEGORY_STYLES: Record<string, string> = {
  pronunciation:
    'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  grammar: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  vocab: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// PLAN.md §4 Phase 4 + §12.2: ranked recurring mistakes, with "conquered" (untouched
// 14+ days after ≥3 occurrences) as the highest-value dopamine signal in the app -
// it's proof of learning, not just activity, so it gets its own visual treatment.
export function ErrorPatternList({ patterns }: { patterns: RankedErrorPattern[] }) {
  if (patterns.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No recurring mistakes yet — they&rsquo;ll show up here after a few practice sessions.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {patterns.map((pattern) => (
        <li
          key={pattern.id}
          className={`rounded-xl border px-4 py-3 ${
            pattern.conquered
              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
              : 'border-slate-200 dark:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLES[pattern.category] ?? ''}`}
              >
                {pattern.category}
              </span>
              {pattern.conquered && (
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  ✅ Conquered
                </span>
              )}
            </div>
            <span className="text-xs text-slate-400">×{pattern.occurrenceCount}</span>
          </div>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{pattern.description}</p>
          {pattern.exampleQuote && (
            <p className="mt-1 text-xs italic text-slate-400">“{pattern.exampleQuote}”</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            First seen {formatDate(pattern.firstSeenAt)} · last seen {formatDate(pattern.lastSeenAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}
