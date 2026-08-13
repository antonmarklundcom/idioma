'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale } from '@/lib/i18n';

// PLAN.md §8 Phase 7B item 2: hands-free turn-taking is gated behind a per-user setting.
// It governs /live only - /lesson never auto-stops, by design rather than by preference.
export function HandsFreeToggle({ initial, locale }: { initial: boolean; locale: Locale }) {
  const strings = t(locale).settings;
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next); // optimistic - reverted below if the write doesn't land
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch('/api/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handsFreeTurnTaking: next }),
      });
      if (!res.ok) throw new Error('save_failed');
      router.refresh();
    } catch {
      setEnabled(!next);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-md flex-col gap-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium text-slate-900 dark:text-white">{strings.handsFreeTitle}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={toggle}
          className={`rounded-full px-3 py-1 text-sm font-medium transition disabled:opacity-50 ${
            enabled ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
          }`}
        >
          {enabled ? strings.handsFreeOn : strings.handsFreeOff}
        </button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{strings.handsFreeDesc}</p>
      {failed && <p className="text-sm text-red-600 dark:text-red-400">{strings.saveFailed}</p>}
    </div>
  );
}
