import { EmptyState } from '@/components/ui/EmptyState';
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
    return <EmptyState emoji="🎤">{strings.dashboardComponents.noSessionsYet}</EmptyState>;
  }

  return (
    <ul className="card flex flex-col divide-y divide-line py-1">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center justify-between py-3 text-sm">
          <div>
            <span className="font-bold text-ink">
              {strings.dashboardComponents.modeLabels[s.mode]}
            </span>
            <span className="ml-2 text-ink-muted">{formatDateTime(s.startedAt)}</span>
          </div>
          <span className="text-ink-muted">
            {strings.dashboardComponents.utteranceCount(s.utteranceCount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
