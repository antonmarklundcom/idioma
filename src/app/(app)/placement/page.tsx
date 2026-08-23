import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { buildPlacementLadder } from '@/lib/placement';
import { getUserLocale } from '@/lib/getUserLocale';
import { PlacementRun } from '@/components/placement/PlacementRun';
import { t } from '@/lib/i18n';

/**
 * The spoken level check. Runs AFTER onboarding rather than inside it: every task is
 * an ordinary attempt against the learner's language pair, and the pair is only on
 * the user row once onboarding has been submitted.
 */
export default async function PlacementPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect('/');
  if (!user.languagePairId) redirect('/onboarding');

  const [tasks, locale] = await Promise.all([
    buildPlacementLadder(user.languagePairId),
    getUserLocale(user.id),
  ]);
  const strings = t(locale).placement;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-5 py-8 sm:px-6">
      <h1 className="heading-page">{strings.title}</h1>
      <p className="mt-2 max-w-md text-center text-sm text-ink-muted">{strings.subtitle}</p>

      {tasks.length === 0 ? (
        // A pair whose lessons cannot supply a ladder (too few levels, or no speaking
        // exercises in them). Saying so beats a two-question test that reads as a
        // measurement - the level they chose at onboarding stands.
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="max-w-sm text-center text-sm text-ink-muted">{strings.notAvailable}</p>
          <Link href="/settings" className="btn-secondary">
            {strings.setItYourself}
          </Link>
        </div>
      ) : (
        <PlacementRun tasks={tasks} currentLevel={user.level ?? null} locale={locale} />
      )}
    </div>
  );
}
