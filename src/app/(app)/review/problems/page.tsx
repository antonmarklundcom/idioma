import Link from 'next/link';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { buildProblemDrill } from '@/lib/problemAreas';
import { logContentGap } from '@/lib/usage';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProblemAreas } from '@/components/review/ProblemAreas';

/**
 * "Your problem areas" (ROADMAP.md P1.5b follow-on item 5): a drill built from the
 * learner's own recorded mistakes and their due queue. Nothing is generated - see
 * lib/problemAreas.ts - and the mistakes with nothing to practise are logged as
 * content gaps so the next pack is written against real demand.
 */
export default async function ProblemAreasPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect('/');
  if (!user.languagePairId) redirect('/onboarding');

  const [drill, locale] = await Promise.all([
    buildProblemDrill({ userId: user.id, languagePairId: user.languagePairId }),
    getUserLocale(user.id),
  ]);
  const strings = t(locale);

  // Automatic detection, after the response: a recurring mistake the app cannot
  // practise is exactly the signal the curriculum needs, and the learner should not
  // wait on a write to see their page. Deduplicated per user per day in logUsage's
  // sibling, so opening this page repeatedly is not six requests.
  if (drill.gaps.length > 0) {
    const userId = user.id;
    const gaps = drill.gaps;
    after(async () => {
      for (const patternKey of gaps) await logContentGap(userId, patternKey);
    });
  }

  if (drill.patterns.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-5 px-5 py-10 sm:px-6">
        <h1 className="heading-page">{strings.problemAreas.title}</h1>
        <EmptyState emoji="🎯" className="w-full">
          {strings.problemAreas.emptyState}
        </EmptyState>
        <Link href="/lesson" className="btn-primary">
          {strings.review.goToLessons}
        </Link>
      </div>
    );
  }

  return (
    <ProblemAreas
      drill={drill}
      coachingProfile={user.coachingProfile ?? null}
      locale={locale}
    />
  );
}
