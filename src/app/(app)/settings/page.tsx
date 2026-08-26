import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { languagePairs } from '@/lib/db/schema';
import { auth, signOut } from '@/lib/auth';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';
import { AppLanguageSwitcher } from '@/components/settings/AppLanguageSwitcher';
import { HandsFreeToggle } from '@/components/settings/HandsFreeToggle';
import { SoundToggle } from '@/components/settings/SoundToggle';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { ProfileNotesForm } from '@/components/settings/ProfileNotesForm';
import { CostMeterCard } from '@/components/settings/CostMeterCard';
import { getLearnerCostSummary } from '@/lib/costMeter';

// ROADMAP.md P0.2: settings is a form now, not a receipt. Identity (name, email)
// comes from Google and stays read-only; everything the learner chose about how
// they learn is editable here.
export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user;
  const [pairs, locale, costSummary] = await Promise.all([
    db
      .select({
        id: languagePairs.id,
        displayName: languagePairs.displayName,
        targetLang: languagePairs.targetLang,
      })
      .from(languagePairs)
      .where(eq(languagePairs.active, true)),
    user ? getUserLocale(user.id) : Promise.resolve('en' as const),
    user ? getLearnerCostSummary(user.id) : Promise.resolve(null),
  ]);
  const strings = t(locale);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8 sm:px-6 sm:py-10">
      <h1 className="heading-page">{strings.settings.title}</h1>

      <dl className="card grid max-w-md grid-cols-2 gap-y-2 text-sm">
        <dt className="text-ink-muted">{strings.settings.name}</dt>
        <dd className="font-semibold text-ink">{user?.name ?? '—'}</dd>
        <dt className="text-ink-muted">{strings.settings.email}</dt>
        <dd className="font-semibold text-ink">{user?.email ?? '—'}</dd>
        <dt className="text-ink-muted">{strings.settings.timezone}</dt>
        <dd className="font-semibold text-ink">{user?.timezone ?? '—'}</dd>
      </dl>

      <AppLanguageSwitcher current={locale} />

      {user && (
        <section className="flex flex-col gap-4">
          <h2 className="heading-section">{strings.settings.profileHeading}</h2>
          <SettingsForm
            pairs={pairs}
            locale={locale}
            initial={{
              languagePairId: user.languagePairId,
              level: user.level,
              coachingProfile: user.coachingProfile,
              focusSkills: user.focusSkills,
              timezone: user.timezone,
            }}
          />
          {/* The level above is a self-assessment. This is the same question answered
              by speaking, and it is the only way back to the check after onboarding. */}
          <Link href="/placement" className="btn-secondary btn-sm self-start">
            {strings.settings.recheckLevel}
          </Link>
        </section>
      )}

      {/* What the tutor knows about them, and how it explains corrections
          (ROADMAP.md P1.5b follow-on item 6). */}
      {user && (
        <ProfileNotesForm
          initial={{
            profileNotes: user.profileNotes,
            factLearning: user.factLearning,
            explanationLanguage: user.explanationLanguage,
          }}
          locale={locale}
        />
      )}

      {costSummary && <CostMeterCard summary={costSummary} locale={locale} />}

      <SoundToggle locale={locale} />

      {/* PLAN.md §8 Phase 7B item 2 */}
      <HandsFreeToggle initial={user?.handsFreeTurnTaking ?? true} locale={locale} />

      {/* The word "Admin" sat next to the gear in the header, where it read as part
          of everyone's navigation rather than as the one owner-only door in the app.
          It belongs down here with the other settings. */}
      {user?.role === 'admin' && (
        <section className="flex flex-col gap-2">
          <h2 className="heading-section">{strings.settings.ownerHeading}</h2>
          <p className="text-sm text-ink-muted">{strings.settings.ownerHint}</p>
          <Link href="/admin" className="btn-secondary btn-sm self-start">
            {strings.nav.admin}
          </Link>
        </section>
      )}

      {/* The header's sign-out is desktop-only since P0.3 moved phone navigation
          to the bottom tab bar, so this is the way out on a phone. */}
      <form
        className="sm:hidden"
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/' });
        }}
      >
        <button type="submit" className="btn-secondary btn-sm">
          {strings.nav.signOut}
        </button>
      </form>
    </div>
  );
}
