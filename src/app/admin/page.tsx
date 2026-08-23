import Link from 'next/link';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ModelSettingsForm } from '@/components/admin/ModelSettingsForm';
import { UsagePanel } from '@/components/admin/UsagePanel';
import { ContentImportPanel } from '@/components/admin/ContentImportPanel';
import { PROVIDERS, PROVIDER_IDS, listModels } from '@/lib/llm/catalog';
import { getLlmSettings, providerKeyStatus } from '@/lib/llm/settings';
import { getAdminUsageSummary } from '@/lib/usage';
import { getAllLessonsForAdmin } from '@/lib/lessons';
import { getAdminLearnerCards } from '@/lib/adminLearners';
import { buildInviteRows, invitedEmails, ownerEmails } from '@/lib/owner';
import { PeoplePanel } from '@/components/admin/PeoplePanel';

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    redirect('/dashboard');
  }

  const [settings, keys, usage, lessons, learners] = [
    await getLlmSettings(),
    providerKeyStatus(),
    await getAdminUsageSummary(),
    await getAllLessonsForAdmin(),
    await getAdminLearnerCards(),
  ];
  const invited = invitedEmails();
  const invites = buildInviteRows({
    invited,
    owners: ownerEmails(),
    users: learners.map((l) => ({ email: l.email, name: l.name })),
  });
  const providers = PROVIDER_IDS.map((id) => ({ ...PROVIDERS[id], hasKey: keys[id] }));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10">
      {/* /admin sits outside the (app) route group, so it has no tab bar - and with no
          link out of it the only way back to the app was to close the PWA and reopen
          it. One link is the whole fix. */}
      <Link
        href="/dashboard"
        className="-mx-2 -mb-2 self-start px-2 py-2 text-sm font-bold text-brand-600 dark:text-brand-300"
      >
        ← Back to the app
      </Link>

      <div>
        <h1 className="heading-page">Admin</h1>
        <p className="mt-1 text-ink-muted">
          Which model runs which part of the app. Changes take effect within 30 seconds — no
          redeploy.
        </p>
      </div>

      <ModelSettingsForm initialSettings={settings} models={listModels()} providers={providers} />

      <PeoplePanel learners={learners} invites={invites} inviteListActive={invited.length > 0} />

      <UsagePanel usage={usage} />

      <ContentImportPanel initialLessons={lessons} />
    </div>
  );
}
