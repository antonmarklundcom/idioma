import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ModelSettingsForm } from '@/components/admin/ModelSettingsForm';
import { UsagePanel } from '@/components/admin/UsagePanel';
import { ContentImportPanel } from '@/components/admin/ContentImportPanel';
import { PROVIDERS, PROVIDER_IDS, listModels } from '@/lib/llm/catalog';
import { getLlmSettings, providerKeyStatus } from '@/lib/llm/settings';
import { getAdminUsageSummary } from '@/lib/usage';
import { getAllLessonsForAdmin } from '@/lib/lessons';

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    redirect('/dashboard');
  }

  const [settings, keys, usage, lessons] = [
    await getLlmSettings(),
    providerKeyStatus(),
    await getAdminUsageSummary(),
    await getAllLessonsForAdmin(),
  ];
  const providers = PROVIDER_IDS.map((id) => ({ ...PROVIDERS[id], hasKey: keys[id] }));

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Which model runs which part of the app. Changes take effect within 30 seconds — no
          redeploy.
        </p>
      </div>

      <ModelSettingsForm initialSettings={settings} models={listModels()} providers={providers} />

      <UsagePanel usage={usage} />

      <ContentImportPanel initialLessons={lessons} />
    </div>
  );
}
