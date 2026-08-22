'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale } from '@/lib/i18n';

// ROADMAP.md P0.2. The UI language is deliberately independent of the language
// PAIR being learned (users.ui_locale vs users.language_pair_id): dad can read
// the app in Swedish while learning Spanish. Writes through the standalone
// preferences route, then refreshes so every server component re-renders in the
// new language without a re-login.
const LOCALE_FLAGS: Record<Locale, string> = { en: '🇬🇧', es: '🇵🇾', sv: '🇸🇪' };
const LOCALES: Locale[] = ['en', 'es', 'sv'];

export function AppLanguageSwitcher({ current }: { current: Locale }) {
  const strings = t(current).settings;
  const router = useRouter();
  const [saving, setSaving] = useState<Locale | null>(null);
  const [failed, setFailed] = useState(false);

  async function choose(locale: Locale) {
    if (locale === current) return;
    setSaving(locale);
    setFailed(false);
    try {
      const res = await fetch('/api/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiLocale: locale }),
      });
      if (!res.ok) throw new Error('save_failed');
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="card flex max-w-md flex-col gap-3">
      <span className="font-bold text-ink">{strings.appLanguage}</span>
      <div className="flex flex-wrap gap-2">
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            aria-pressed={locale === current}
            disabled={saving !== null}
            onClick={() => choose(locale)}
            className={`chip gap-2 disabled:opacity-50 ${locale === current ? 'chip-active' : ''}`}
          >
            <span aria-hidden="true" className="text-base">
              {LOCALE_FLAGS[locale]}
            </span>
            {locale.toUpperCase()}
          </button>
        ))}
      </div>
      {failed && (
        <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">
          {strings.saveFailed}
        </p>
      )}
    </div>
  );
}
