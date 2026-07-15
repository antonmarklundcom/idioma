import { auth } from '@/lib/auth';

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
      <dl className="grid max-w-md grid-cols-2 gap-y-2 text-sm">
        <dt className="text-slate-500 dark:text-slate-400">Name</dt>
        <dd className="text-slate-800 dark:text-slate-100">{user?.name ?? '—'}</dd>
        <dt className="text-slate-500 dark:text-slate-400">Email</dt>
        <dd className="text-slate-800 dark:text-slate-100">{user?.email ?? '—'}</dd>
        <dt className="text-slate-500 dark:text-slate-400">Level</dt>
        <dd className="text-slate-800 dark:text-slate-100">{user?.level ?? '—'}</dd>
        <dt className="text-slate-500 dark:text-slate-400">Coaching style</dt>
        <dd className="text-slate-800 dark:text-slate-100">{user?.coachingProfile ?? '—'}</dd>
        <dt className="text-slate-500 dark:text-slate-400">Timezone</dt>
        <dd className="text-slate-800 dark:text-slate-100">{user?.timezone ?? '—'}</dd>
      </dl>
      <p className="text-sm text-slate-400 dark:text-slate-500">
        Editing these values in-place arrives alongside the lesson flow (Phase 3+).
      </p>
    </div>
  );
}
