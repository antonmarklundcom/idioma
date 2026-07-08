import { signOut } from '@/lib/auth';

export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/' });
      }}
    >
      <button
        type="submit"
        className="text-sm text-slate-500 underline-offset-4 hover:underline dark:text-slate-400"
      >
        Sign out
      </button>
    </form>
  );
}
