import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getConversationList, getProgressInsights } from '@/lib/progress';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';
import { EmptyState } from '@/components/ui/EmptyState';
import { InsightsPanel } from '@/components/dashboard/InsightsPanel';

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Saved conversations (owner request, Aug 2026). No new recording happens for this:
// every turn already wrote its transcript, correction and error list to `utterances`;
// this is the first screen that reads them back.
export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) redirect('/');

  const [conversations, insights, locale] = await Promise.all([
    getConversationList(session.user.id),
    getProgressInsights(session.user.id),
    getUserLocale(session.user.id),
  ]);
  const strings = t(locale);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10">
      <div>
        <h1 className="heading-page">{strings.history.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{strings.history.subtitle}</p>
      </div>

      {/* What the conversations add up to, above the conversations themselves. */}
      <InsightsPanel insights={insights} locale={locale} />

      {conversations.length === 0 ? (
        <EmptyState emoji="💬">{strings.history.empty}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/history/${c.id}`}
                className="card flex items-center justify-between gap-3 transition-transform active:scale-[0.99]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-bold text-ink">
                    {c.lessonTitle ?? strings.dashboardComponents.modeLabels[c.mode]}
                  </span>
                  {c.preview && (
                    <span className="truncate text-sm text-ink-muted italic">
                      &ldquo;{c.preview}&rdquo;
                    </span>
                  )}
                  <span className="text-xs font-semibold text-ink-muted">
                    {formatDateTime(c.startedAt)} · {strings.history.turns(c.utteranceCount)} ·{' '}
                    {strings.history.mistakes(c.errorCount)}
                  </span>
                </span>
                <span aria-hidden="true" className="text-ink-muted">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
