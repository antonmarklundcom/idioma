import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDueReviewItems } from '@/lib/srs';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';
import { ReviewSession } from '@/components/review/ReviewSession';
import type { ReviewCard } from '@/types';

// PLAN.md §13.4: one round is up to 10 due items. The queue is read here rather
// than fetched from /api/review by the client - same data, one less round trip -
// and only the fields the UI needs cross to the browser (scheduling state stays
// on the server, where the grades are applied).
export default async function ReviewPage() {
  const session = await auth();
  if (!session?.user) redirect('/');
  if (!session.user.languagePairId) redirect('/onboarding');

  const [due, locale] = await Promise.all([
    getDueReviewItems({
      userId: session.user.id,
      languagePairId: session.user.languagePairId,
    }),
    getUserLocale(session.user.id),
  ]);
  const strings = t(locale);

  const cards: ReviewCard[] = due.map((item) => ({
    id: item.id,
    kind: item.kind,
    front: item.front,
    back: item.back,
  }));

  if (cards.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center gap-4 px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{strings.review.title}</h1>
        <p className="max-w-sm text-center text-sm text-slate-600 dark:text-slate-300">
          {strings.review.emptyState}
        </p>
        <Link
          href="/lesson"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
        >
          {strings.review.goToLessons}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-6 pt-10">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{strings.review.title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {strings.review.itemsDue(cards.length)}
        </p>
      </div>
      <ReviewSession
        cards={cards}
        coachingProfile={session.user.coachingProfile ?? null}
        locale={locale}
      />
    </div>
  );
}
