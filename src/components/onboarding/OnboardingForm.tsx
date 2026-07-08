'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cefrLevels } from '@/lib/zodSchemas';

type LanguagePairOption = { id: string; displayName: string };

export function OnboardingForm({ pairs }: { pairs: LanguagePairOption[] }) {
  const router = useRouter();
  const [languagePairId, setLanguagePairId] = useState(pairs[0]?.id ?? '');
  const [level, setLevel] = useState<(typeof cefrLevels)[number]>('A1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languagePairId, level }),
    });
    if (!res.ok) {
      setSubmitting(false);
      setError('Something went wrong. Please try again.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          What are you learning?
        </label>
        <select
          value={languagePairId}
          onChange={(e) => setLanguagePairId(e.target.value)}
          className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700 dark:bg-slate-900"
        >
          {pairs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Your current level
        </label>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as (typeof cefrLevels)[number])}
          className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700 dark:bg-slate-900"
        >
          {cefrLevels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !languagePairId}
        className="rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
      >
        {submitting ? 'Saving...' : 'Start learning'}
      </button>
    </form>
  );
}
