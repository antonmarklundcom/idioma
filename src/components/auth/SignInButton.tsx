import { signIn } from '@/lib/auth';

export function SignInButton() {
  return (
    <form
      action={async () => {
        'use server';
        await signIn('google', { redirectTo: '/onboarding' });
      }}
    >
      <button
        type="submit"
        className="rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        Sign in with Google
      </button>
    </form>
  );
}
