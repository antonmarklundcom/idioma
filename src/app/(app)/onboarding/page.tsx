import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { languagePairs } from '@/lib/db/schema';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';
import { t } from '@/lib/i18n';

// PLAN.md §8 Phase 8: nativeLang (and thus locale) isn't set on the user row until
// onboarding submits, so this page always renders in `en` - a known, one-screen
// exception to "the UI reads in the user's language" (see PR description).
export default async function OnboardingPage() {
  const pairs = await db
    .select({ id: languagePairs.id, code: languagePairs.code, displayName: languagePairs.displayName })
    .from(languagePairs)
    .where(eq(languagePairs.active, true));
  const strings = t('en');

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          {strings.onboarding.title}
        </h1>
        <p className="max-w-md text-slate-500 dark:text-slate-400">
          {strings.onboarding.subtitle}
        </p>
      </div>
      <OnboardingForm languagePairs={pairs} locale="en" />
    </div>
  );
}
