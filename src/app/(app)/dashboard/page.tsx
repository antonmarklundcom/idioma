import { auth } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        ¡Bienvenido{session?.user.name ? `, ${session.user.name}` : ''}!
      </h1>
      <p className="text-slate-600 dark:text-slate-300">
        Your progress dashboard and recurring-mistakes tracker will live here
        (Phase 4). Lesson practice arrives in Phase 3.
      </p>
    </div>
  );
}
