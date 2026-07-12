import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { languagePairs } from '@/lib/db/schema';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';

export default async function OnboardingPage() {
  const pairs = await db
    .select({ id: languagePairs.id, code: languagePairs.code, displayName: languagePairs.displayName })
    .from(languagePairs)
    .where(eq(languagePairs.active, true));

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Let&rsquo;s set you up
        </h1>
        <p className="max-w-md text-slate-500 dark:text-slate-400">
          A few quick questions so your tutor coaches you the right way from the start.
        </p>
      </div>
      <OnboardingForm languagePairs={pairs} />
    </div>
  );
}
