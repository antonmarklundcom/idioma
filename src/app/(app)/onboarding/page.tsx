import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { languagePairs } from '@/lib/db/schema';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';
import { pickPreselectedLanguagePairId } from '@/lib/onboarding';
import { t } from '@/lib/i18n';

// PLAN.md §8 Phase 8: nativeLang (and thus locale) isn't set on the user row until
// onboarding submits, so this page always renders in `en` - a known, one-screen
// exception to "the UI reads in the user's language" (see PR description).
export default async function OnboardingPage() {
  const [pairs, acceptLanguage] = await Promise.all([
    db
      .select({
        id: languagePairs.id,
        code: languagePairs.code,
        displayName: languagePairs.displayName,
        nativeLang: languagePairs.nativeLang,
      })
      .from(languagePairs)
      .where(eq(languagePairs.active, true)),
    headers().then((h) => h.get('accept-language')),
  ]);
  const strings = t('en');
  // ROADMAP.md P3.13: a parent whose phone is set to Swedish shouldn't have to find
  // "Spanish (Paraguay) för svensktalande" in a list themselves.
  const preselectedLanguagePairId = pickPreselectedLanguagePairId(pairs, acceptLanguage);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="heading-page text-4xl">
          {strings.onboarding.title}
        </h1>
        <p className="max-w-md text-ink-muted">
          {strings.onboarding.subtitle}
        </p>
      </div>
      <OnboardingForm
        languagePairs={pairs}
        locale="en"
        preselectedLanguagePairId={preselectedLanguagePairId}
      />
    </div>
  );
}
