'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ReviewSession } from '@/components/review/ReviewSession';
import type { CoachingProfile } from '@/lib/db/schema';
import type { ProblemDrill } from '@/lib/problemAreas';
import type { ReviewCard } from '@/types';
import { t, type Locale } from '@/lib/i18n';

/**
 * The learner-facing half of item 5: the mistakes ranked, then the drill built from
 * them. Two screens rather than one - seeing WHAT you keep getting wrong is worth a
 * moment on its own, and starting a drill you did not ask for is how a nudge turns
 * into a chore.
 *
 * A pattern with nothing stored to practise it gets a button instead of a card. That
 * is the honest answer ("we have nothing for this yet") plus the only useful thing
 * the app can do about it: tell the person writing the curriculum.
 */
export function ProblemAreas({
  drill,
  coachingProfile,
  locale,
}: {
  drill: ProblemDrill;
  coachingProfile: CoachingProfile | null;
  locale: Locale;
}) {
  const strings = t(locale).problemAreas;
  const [started, setStarted] = useState(false);
  const [requested, setRequested] = useState<string[]>([]);

  const cards: ReviewCard[] = drill.cards.map((card) => ({
    id: card.id,
    kind: card.kind,
    front: card.front,
    back: card.back,
  }));

  async function requestPractice(patternKey: string) {
    // Optimistic: the request is a signal to the curriculum author, not a
    // transaction, and a learner does not need a spinner to be told "noted".
    setRequested((current) => [...current, patternKey]);
    await fetch('/api/content-gap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patternKey }),
    }).catch(() => {});
  }

  if (started && cards.length > 0) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-2xl px-5 pt-8 sm:px-6 sm:pt-10">
          <h1 className="heading-page">{strings.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{strings.drillSize(cards.length)}</p>
        </div>
        <ReviewSession cards={cards} coachingProfile={coachingProfile} locale={locale} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-8 sm:px-6 sm:py-10">
      <div>
        <h1 className="heading-page">{strings.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{strings.subtitle}</p>
      </div>

      <ol className="flex flex-col gap-2">
        {drill.patterns.map((pattern) => (
          <li key={pattern.id} className="card flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-ink">{pattern.description}</p>
              <span className="shrink-0 text-sm text-ink-muted">
                {strings.timesSeen(pattern.occurrenceCount)}
              </span>
            </div>
            {!pattern.hasMaterial &&
              (requested.includes(pattern.patternKey) ? (
                <p className="text-sm font-bold text-success-700 dark:text-success-500">
                  {strings.practiceRequested}
                </p>
              ) : (
                <div className="flex flex-col items-start gap-1">
                  <p className="text-sm text-ink-muted">{strings.nothingStoredYet}</p>
                  <button
                    type="button"
                    onClick={() => requestPractice(pattern.patternKey)}
                    className="btn-secondary btn-sm"
                  >
                    {strings.requestPractice}
                  </button>
                </div>
              ))}
          </li>
        ))}
      </ol>

      {cards.length > 0 ? (
        <button type="button" onClick={() => setStarted(true)} className="btn-primary self-start">
          {strings.startDrill(cards.length)}
        </button>
      ) : (
        <p className="text-sm text-ink-muted">{strings.nothingToDrill}</p>
      )}

      <Link href="/dashboard" className="text-sm font-bold text-ink-muted">
        {strings.backToDashboard}
      </Link>
    </div>
  );
}
