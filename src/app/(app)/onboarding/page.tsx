import { eq } from 'drizzle-orm';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';
import { db } from '@/lib/db';
import { languagePairs } from '@/lib/db/schema';

export default async function OnboardingPage() {
  const pairs = await db
    .select({ id: languagePairs.id, displayName: languagePairs.displayName })
    .from(languagePairs)
    .where(eq(languagePairs.active, true));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          ¡Bienvenido a Idioma!
        </h1>
        <p className="mt-1 text-slate-600 dark:text-slate-300">
          Tell us what you&apos;re learning and your current level to get started.
        </p>
      </div>
      <OnboardingForm pairs={pairs} />
    </div>
  );
}
