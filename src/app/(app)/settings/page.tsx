import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { languagePairs } from '@/lib/db/schema';
import { auth, signOut } from '@/lib/auth';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';
import { AppLanguageSwitcher } from '@/components/settings/AppLanguageSwitcher';
import { HandsFreeToggle } from '@/components/settings/HandsFreeToggle';
import { SettingsForm } from '@/components/settings/SettingsForm';

// ROADMAP.md P0.2: settings is a form now, not a receipt. Identity (name, email)
// comes from Google and stays read-only; everything the learner chose about how
// they learn is editable here.
export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user;
  const [pairs, locale] = await Promise.all([
    db
      .select({
        id: languagePairs.id,
        displayName: languagePairs.displayName,
        targetLang: languagePairs.targetLang,
      })
      .from(languagePairs)
      .where(eq(languagePairs.active, true)),
    user ? getUserLocale(user.id) : Promise.resolve('en' as const),
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
        </section>
      )}

      {/* PLAN.md §8 Phase 7B item 2 */}
      <HandsFreeToggle initial={user?.handsFreeTurnTaking ?? true} locale={locale} />

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
