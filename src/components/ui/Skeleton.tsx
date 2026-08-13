// PLAN.md §8 Phase 8: loading.tsx fallbacks render before the page's data - and
// therefore its locale - is known, so skeletons stay wordless (shape only) rather
// than guessing a language.
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800 ${className}`}
    />
  );
}
