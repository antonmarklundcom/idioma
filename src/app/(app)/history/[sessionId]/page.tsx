import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getConversation } from '@/lib/progress';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';

const SEVERITY_STYLES: Record<string, string> = {
  minor: 'border-streak-500/40 bg-streak-50 text-streak-700 dark:bg-streak-500/10',
  moderate: 'border-streak-600/50 bg-streak-100 text-streak-700 dark:bg-streak-500/15',
  major: 'border-brand-400 bg-brand-50 text-brand-800 dark:bg-brand-900/25 dark:text-brand-200',
};

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// One saved conversation, replayed as text. getConversation scopes by userId in the
// query itself, so someone else's session id is a 404 rather than a leak - a
// transcript is the most personal thing this app stores.
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/');

  const { sessionId } = await params;
  const [conversation, locale] = await Promise.all([
    getConversation(sessionId, session.user.id),
    getUserLocale(session.user.id),
  ]);
  if (!conversation) notFound();
  const strings = t(locale);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10">
      <div>
        <Link href="/history" className="text-sm font-semibold text-brand-600 dark:text-brand-300">
          ← {strings.history.backToHistory}
        </Link>
        <h1 className="heading-page mt-2">
          {conversation.lessonTitle ?? strings.dashboardComponents.modeLabels[conversation.mode]}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {formatDateTime(conversation.startedAt)} ·{' '}
          {strings.history.turns(conversation.turns.length)}
        </p>
      </div>

      <ol className="flex flex-col gap-4">
        {conversation.turns.map((turn) => (
          <li key={turn.id} className="card flex flex-col gap-3">
            <div>
              <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
                {strings.history.youSaid}
              </p>
              <p className="text-ink">{turn.transcript ?? strings.history.noTranscript}</p>
            </div>

            {/* Shown only when it differs: repeating a correct sentence back as a
                "correction" teaches nothing and makes a clean turn look wrong. */}
            {turn.corrected && turn.corrected !== turn.transcript && (
              <div>
                <p className="text-xs font-bold tracking-wide text-success-700 uppercase dark:text-success-500">
                  {strings.history.betterWay}
                </p>
                <p className="font-semibold text-ink">{turn.corrected}</p>
              </div>
            )}

            {turn.errors.length > 0 && (
              <ul className="flex flex-col gap-2">
                {turn.errors.map((err, i) => (
                  <li
                    key={i}
                    className={`rounded-xl border-2 px-3 py-2 text-sm ${SEVERITY_STYLES[err.severity] ?? 'border-line'}`}
                  >
                    <p>
                      <span className="line-through opacity-70">{err.quote}</span>{' '}
                      <span className="font-bold">→ {err.correction}</span>
                    </p>
                    <p className="mt-1 opacity-90">{err.explanation}</p>
                  </li>
                ))}
              </ul>
            )}

            {turn.tutorReply && (
              <div className="rounded-2xl bg-surface-muted p-3">
                <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
                  {strings.history.tutorSaid}
                </p>
                <p className="text-ink">{turn.tutorReply}</p>
                {turn.followUpQuestion && (
                  <p className="mt-1 font-semibold text-ink">{turn.followUpQuestion}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
