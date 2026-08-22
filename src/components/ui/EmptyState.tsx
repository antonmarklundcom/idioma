import type { ReactNode } from 'react';

// ROADMAP.md P0.3: an empty screen should feel like a friendly "not yet",
// not like a page that failed to load. Emoji-scale illustration only - no asset
// pipeline, and it costs nothing on a phone connection.
export function EmptyState({
  emoji,
  children,
  className = '',
}: {
  emoji: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-surface px-6 py-10 text-center ${className}`}
    >
      <span aria-hidden="true" className="text-4xl">
        {emoji}
      </span>
      <div className="max-w-sm text-sm text-ink-muted">{children}</div>
    </div>
  );
}
