import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin</h1>
      <p className="text-slate-500 dark:text-slate-400">
        Usage stats (§6.5) and content import (§2, Phase 5) land here.
      </p>
    </div>
  );
}
