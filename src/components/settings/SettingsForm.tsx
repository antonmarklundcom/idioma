'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { flagForLanguage } from '@/lib/flags';
import { focusSkillValues } from '@/lib/zodSchemas';
import { t, type Locale } from '@/lib/i18n';
import type { CefrLevel, CoachingProfile } from '@/lib/db/schema';

type LanguagePairOption = {
  id: string;
  displayName: string;
  targetLang: string;
};

export type SettingsFormValues = {
  languagePairId: string | null;
  level: CefrLevel | null;
  coachingProfile: CoachingProfile | null;
  focusSkills: string[] | null;
  timezone: string | null;
};

const CEFR_LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

// ROADMAP.md P0.2: the read-only profile list becomes editable, submitted as ONE
// PATCH /api/me - the same onboarding shape, because these are the same five
// fields, and reusing the route means one validator and one place that resolves a
// pair to its native/target languages. The headings reuse the onboarding strings
// for the same reason: it is literally the same question, asked again later.
export function SettingsForm({
  pairs,
  initial,
  locale,
}: {
  pairs: LanguagePairOption[];
  initial: SettingsFormValues;
  locale: Locale;
}) {
  const strings = t(locale);
  const onboarding = strings.onboarding;
  const router = useRouter();

  const [languagePairId, setLanguagePairId] = useState(
    initial.languagePairId ?? pairs[0]?.id ?? '',
  );
  const [level, setLevel] = useState<CefrLevel>(initial.level ?? 'A1');
  const [coachingProfile, setCoachingProfile] = useState<CoachingProfile>(
    initial.coachingProfile ?? 'confidence_first',
  );
  const [focusSkills, setFocusSkills] = useState<string[]>(
    initial.focusSkills?.length ? initial.focusSkills : ['speaking-confidence'],
  );
  // The stored timezone is kept as-is - this form is about the learning profile,
  // and silently re-detecting would move someone's streak deadline while they were
  // editing their level. Only a user who has none yet gets one detected, after
  // mount so the server and first client render still agree (React error #418).
  const [timezone, setTimezone] = useState(initial.timezone ?? 'UTC');

  useEffect(() => {
    if (initial.timezone) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }, [initial.timezone]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleFocusSkill(skill: string) {
    setSaved(false);
    setFocusSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (focusSkills.length === 0) {
      setError(onboarding.pickFocusError);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          languagePairId,
          level,
          coachingProfile,
          focusSkills,
          timezone,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? onboarding.genericError);
        return;
      }
      setSaved(true);
      // Swapping the pair changes which lessons exist everywhere else in the app,
      // so re-render the server components rather than leaving stale ones behind.
      router.refresh();
    } catch {
      setError(onboarding.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="heading-section">{onboarding.whatLearning}</legend>
        <div className="flex flex-col gap-2">
          {pairs.map((pair) => (
            <label key={pair.id} className="option-card items-center">
              <input
                type="radio"
                name="languagePairId"
                value={pair.id}
                checked={languagePairId === pair.id}
                onChange={() => {
                  setSaved(false);
                  setLanguagePairId(pair.id);
                }}
              />
              <span aria-hidden="true">{flagForLanguage(pair.targetLang)}</span>
              <span className="font-semibold text-ink">{pair.displayName}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="heading-section">{onboarding.currentLevel}</legend>
        <div className="flex flex-wrap gap-2">
          {CEFR_LEVELS.map((lvl) => (
            <button
              type="button"
              key={lvl}
              aria-pressed={level === lvl}
              onClick={() => {
                setSaved(false);
                setLevel(lvl);
              }}
              className={`chip ${level === lvl ? 'chip-active' : ''}`}
            >
              {lvl}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-muted">{onboarding.levelHint}</p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="heading-section">{onboarding.coachHeading}</legend>
        <label className="option-card">
          <input
            type="radio"
            name="coachingProfile"
            className="mt-1"
            checked={coachingProfile === 'confidence_first'}
            onChange={() => {
              setSaved(false);
              setCoachingProfile('confidence_first');
            }}
          />
          <span>
            <span className="block font-bold text-ink">{onboarding.gentleTitle}</span>
            <span className="block text-sm text-ink-muted">{onboarding.gentleDesc}</span>
          </span>
        </label>
        <label className="option-card">
          <input
            type="radio"
            name="coachingProfile"
            className="mt-1"
            checked={coachingProfile === 'accuracy_focus'}
            onChange={() => {
              setSaved(false);
              setCoachingProfile('accuracy_focus');
            }}
          />
          <span>
            <span className="block font-bold text-ink">{onboarding.accuracyTitle}</span>
            <span className="block text-sm text-ink-muted">{onboarding.accuracyDesc}</span>
          </span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="heading-section">{onboarding.focusHeading}</legend>
        <div className="flex flex-wrap gap-2">
          {focusSkillValues.map((skill) => (
            <button
              type="button"
              key={skill}
              aria-pressed={focusSkills.includes(skill)}
              onClick={() => toggleFocusSkill(skill)}
              className={`chip ${focusSkills.includes(skill) ? 'chip-active' : ''}`}
            >
              {onboarding.focusSkills[skill]}
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || !languagePairId} className="btn-primary">
          {saving ? onboarding.saving : strings.settings.saveChanges}
        </button>
        {saved && !saving && (
          <span className="text-sm font-bold text-success-600" role="status">
            {strings.settings.savedOk}
          </span>
        )}
      </div>
    </form>
  );
}
