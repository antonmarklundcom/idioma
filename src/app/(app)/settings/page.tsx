import { auth } from '@/lib/auth';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';
import { HandsFreeToggle } from '@/components/settings/HandsFreeToggle';

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user;
  const locale = user ? await getUserLocale(user.id) : 'en';
  const strings = t(locale);

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{strings.settings.title}</h1>
      <dl className="grid max-w-md grid-cols-2 gap-y-2 text-sm">
        <dt className="text-slate-500 dark:text-slate-400">{strings.settings.name}</dt>
        <dd className="text-slate-800 dark:text-slate-100">{user?.name ?? '—'}</dd>
        <dt className="text-slate-500 dark:text-slate-400">{strings.settings.email}</dt>
        <dd className="text-slate-800 dark:text-slate-100">{user?.email ?? '—'}</dd>
        <dt className="text-slate-500 dark:text-slate-400">{strings.settings.level}</dt>
        <dd className="text-slate-800 dark:text-slate-100">{user?.level ?? '—'}</dd>
        <dt className="text-slate-500 dark:text-slate-400">{strings.settings.coachingStyle}</dt>
        <dd className="text-slate-800 dark:text-slate-100">{user?.coachingProfile ?? '—'}</dd>
        <dt className="text-slate-500 dark:text-slate-400">{strings.settings.timezone}</dt>
        <dd className="text-slate-800 dark:text-slate-100">{user?.timezone ?? '—'}</dd>
      </dl>

      {/* PLAN.md §8 Phase 7B item 2 */}
      <HandsFreeToggle initial={user?.handsFreeTurnTaking ?? true} locale={locale} />

      <p className="text-sm text-slate-400 dark:text-slate-500">{strings.settings.editingNote}</p>
    </div>
  );
}
