import { auth } from '@/lib/auth';
import { SignOutButton } from '@/components/auth/SignOutButton';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <span className="text-lg font-semibold text-slate-900 dark:text-white">
          🗣️ Idioma
        </span>
        {session && (
          <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
            <span>{session.user.name ?? session.user.email}</span>
            <SignOutButton />
          </div>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
