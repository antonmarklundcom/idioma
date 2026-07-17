import type { SessionSummary } from '@/lib/progress';

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SessionHistory({ sessions }: { sessions: SessionSummary[] }) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No practice sessions yet — head to Lessons to get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {sessions.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700"
        >
          <div>
            <span className="font-medium text-slate-800 dark:text-slate-100">
              {s.mode === 'live' ? 'Conversation' : 'Lesson'}
            </span>
            <span className="ml-2 text-slate-400">{formatDateTime(s.startedAt)}</span>
          </div>
          <span className="text-slate-500 dark:text-slate-400">
            {s.utteranceCount} turn{s.utteranceCount === 1 ? '' : 's'}
          </span>
        </li>
      ))}
    </ul>
  );
}
