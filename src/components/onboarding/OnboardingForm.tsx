'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { focusSkillValues } from '@/lib/zodSchemas';
import { t, type Locale } from '@/lib/i18n';

type LanguagePairOption = {
  id: string;
  code: string;
  displayName: string;
};

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;

export function OnboardingForm({
  languagePairs,
  locale,
}: {
  languagePairs: LanguagePairOption[];
  locale: Locale;
}) {
  const strings = t(locale).onboarding;
  const router = useRouter();
  const [languagePairId, setLanguagePairId] = useState(languagePairs[0]?.id ?? '');
  const [level, setLevel] = useState<(typeof CEFR_LEVELS)[number]>('A1');
  const [coachingProfile, setCoachingProfile] = useState<'confidence_first' | 'accuracy_focus'>(
    'confidence_first',
  );
  const [focusSkills, setFocusSkills] = useState<string[]>(['speaking-confidence']);
  // Starts as 'UTC' (matches the server's render) and is corrected client-side after
  // mount, so the server-rendered HTML and the first client render agree - computing
  // the browser's real timezone directly in useState's initializer diverges from the
  // server (React error #418), which aborts hydration and breaks every click handler
  // on the page, not just this form's.
  const [timezone, setTimezone] = useState('UTC');

  useEffect(() => {
    // The one-time extra render this causes is the point: it's what corrects the
    // 'UTC' placeholder to the browser's real timezone after hydration has already
    // completed safely.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleFocusSkill(skill: string) {
    setFocusSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (focusSkills.length === 0) {
      setError(strings.pickFocusError);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ languagePairId, level, coachingProfile, focusSkills, timezone }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? strings.genericError);
        return;
      }
      router.push('/today');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-lg flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="heading-section">{strings.whatLearning}</legend>
        <div className="flex flex-col gap-2">
          {languagePairs.map((pair) => (
            <label
              key={pair.id}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-line bg-surface px-4 py-3.5 shadow-card has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:has-[:checked]:bg-brand-900/25"
            >
              <input
                type="radio"
                name="languagePairId"
                value={pair.id}
                checked={languagePairId === pair.id}
                onChange={() => setLanguagePairId(pair.id)}
              />
              <span className="font-semibold text-ink">{pair.displayName}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="heading-section">{strings.currentLevel}</legend>
        <div className="flex flex-wrap gap-2">
          {CEFR_LEVELS.map((lvl) => (
            <button
              type="button"
              key={lvl}
              onClick={() => setLevel(lvl)}
              className={`chip ${level === lvl ? 'chip-active' : ''}`}
            >
              {lvl}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-muted">{strings.levelHint}</p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="heading-section">{strings.coachHeading}</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-line bg-surface px-4 py-3.5 shadow-card has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:has-[:checked]:bg-brand-900/25">
          <input
            type="radio"
            name="coachingProfile"
            className="mt-1"
            checked={coachingProfile === 'confidence_first'}
            onChange={() => setCoachingProfile('confidence_first')}
          />
          <span>
            <span className="block font-bold text-ink">{strings.gentleTitle}</span>
            <span className="block text-sm text-ink-muted">{strings.gentleDesc}</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-line bg-surface px-4 py-3.5 shadow-card has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:has-[:checked]:bg-brand-900/25">
          <input
            type="radio"
            name="coachingProfile"
            className="mt-1"
            checked={coachingProfile === 'accuracy_focus'}
            onChange={() => setCoachingProfile('accuracy_focus')}
          />
          <span>
            <span className="block font-bold text-ink">{strings.accuracyTitle}</span>
            <span className="block text-sm text-ink-muted">{strings.accuracyDesc}</span>
          </span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="heading-section">{strings.focusHeading}</legend>
        <div className="flex flex-wrap gap-2">
          {focusSkillValues.map((skill) => (
            <button
              type="button"
              key={skill}
              onClick={() => toggleFocusSkill(skill)}
              className={`chip ${focusSkills.includes(skill) ? 'chip-active' : ''}`}
            >
              {strings.focusSkills[skill]}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="text-xs text-ink-muted">{strings.timezoneNote(timezone)}</p>

      {error && <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{error}</p>}

      <button type="submit" disabled={submitting || !languagePairId} className="btn-primary">
        {submitting ? strings.saving : strings.startLearning}
      </button>
    </form>
  );
}
