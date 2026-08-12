import type { SessionSummary } from '@/lib/progress';
import { t, type Locale } from '@/lib/i18n';

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SessionHistory({
  sessions,
  locale,
}: {
  sessions: SessionSummary[];
  locale: Locale;
}) {
  const strings = t(locale);
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {strings.dashboardComponents.noSessionsYet}
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-slate-200 dark:divide-slate-800">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center justify-between py-2 text-sm">
          <div>
            <span className="font-medium text-slate-800 dark:text-slate-100">
              {strings.dashboardComponents.modeLabels[s.mode]}
            </span>
            <span className="ml-2 text-slate-400">{formatDateTime(s.startedAt)}</span>
          </div>
          <span className="text-slate-500 dark:text-slate-400">
            {strings.dashboardComponents.utteranceCount(s.utteranceCount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
