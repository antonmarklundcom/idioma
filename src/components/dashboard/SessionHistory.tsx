import type { PracticeMode } from '@/lib/db/schema';
import type { SessionSummary } from '@/lib/progress';

const MODE_LABELS: Record<PracticeMode, string> = {
  lesson: 'Lesson practice',
  live: 'Live conversation',
  review: 'Review round',
};

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
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
    <ul className="flex flex-col divide-y divide-slate-200 dark:divide-slate-800">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center justify-between py-2 text-sm">
          <div>
            <span className="font-medium text-slate-800 dark:text-slate-100">
              {MODE_LABELS[s.mode]}
            </span>
            <span className="ml-2 text-slate-400">{formatDateTime(s.startedAt)}</span>
          </div>
          <span className="text-slate-500 dark:text-slate-400">
            {s.utteranceCount} utterance{s.utteranceCount === 1 ? '' : 's'}
          </span>
        </li>
      ))}
    </ul>
  );
}
