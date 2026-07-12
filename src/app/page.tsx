import { redirect } from 'next/navigation';
import { auth, signIn } from '@/lib/auth';

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-sky-50 to-white px-6 text-center font-sans dark:from-slate-950 dark:to-slate-900">
      <div className="flex flex-col items-center gap-3">
        <span className="text-6xl" role="img" aria-label="Idioma">
          🗣️
        </span>
        <h1 className="text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
          Idioma
        </h1>
        <p className="max-w-md text-lg text-slate-600 dark:text-slate-300">
          Hablá. Escuchá. Aprendé.
        </p>
        <p className="max-w-md text-base text-slate-500 dark:text-slate-400">
          Practice Paraguayan Spanish or English by speaking — get instant,
          personal feedback from your AI tutor.
        </p>
      </div>

      <form
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/dashboard' });
        }}
      >
        <button
          type="submit"
          className="rounded-full bg-slate-900 px-6 py-3 font-medium text-white dark:bg-white dark:text-slate-900"
        >
          Sign in with Google
        </button>
      </form>

      <div className="rounded-full border border-slate-200 px-5 py-2 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Beta privada · private beta — invite only
      </div>
    </main>
  );
}
