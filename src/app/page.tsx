import { redirect } from 'next/navigation';
import { auth, signIn } from '@/lib/auth';

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-brand-50 to-surface-sunken px-6 text-center font-sans dark:from-brand-900/30 dark:to-surface-sunken">
      <div className="flex flex-col items-center gap-3">
        <span className="animate-pop text-6xl" role="img" aria-label="Idioma">
          🗣️
        </span>
        <h1 className="text-6xl font-extrabold tracking-tight text-ink">Idioma</h1>
        <p className="max-w-md text-lg font-bold text-brand-700 dark:text-brand-300">
          Hablá. Escuchá. Aprendé.
        </p>
        <p className="max-w-md text-base text-ink-muted">
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
          className="btn-primary"
        >
          Sign in with Google
        </button>
      </form>

      <div className="rounded-full border-2 border-line px-5 py-2 text-sm text-ink-muted">
        Beta privada · private beta — invite only
      </div>
    </main>
  );
}
