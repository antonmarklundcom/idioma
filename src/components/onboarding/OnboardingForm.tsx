'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { focusSkillValues } from '@/lib/zodSchemas';

type LanguagePairOption = {
  id: string;
  code: string;
  displayName: string;
};

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;

const FOCUS_SKILL_LABELS: Record<(typeof focusSkillValues)[number], string> = {
  'speaking-confidence': 'Confidence to speak',
  grammar: 'Grammar accuracy',
  listening: 'Listening comprehension',
  pronunciation: 'Pronunciation',
  vocabulary: 'Vocabulary',
};

export function OnboardingForm({ languagePairs }: { languagePairs: LanguagePairOption[] }) {
  const router = useRouter();
  const [languagePairId, setLanguagePairId] = useState(languagePairs[0]?.id ?? '');
  const [level, setLevel] = useState<(typeof CEFR_LEVELS)[number]>('A1');
  const [coachingProfile, setCoachingProfile] = useState<'confidence_first' | 'accuracy_focus'>(
    'confidence_first',
  );
  const [focusSkills, setFocusSkills] = useState<string[]>(['speaking-confidence']);
  const [timezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );
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
      setError('Pick at least one thing to focus on.');
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
        setError(data.error ?? 'Something went wrong. Try again.');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-lg flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold text-slate-900 dark:text-white">
          What are you learning?
        </legend>
        <div className="flex flex-col gap-2">
          {languagePairs.map((pair) => (
            <label
              key={pair.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50 dark:border-slate-700 dark:has-[:checked]:bg-sky-950"
            >
              <input
                type="radio"
                name="languagePairId"
                value={pair.id}
                checked={languagePairId === pair.id}
                onChange={() => setLanguagePairId(pair.id)}
              />
              <span className="text-slate-800 dark:text-slate-100">{pair.displayName}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold text-slate-900 dark:text-white">
          Current level
        </legend>
        <div className="flex flex-wrap gap-2">
          {CEFR_LEVELS.map((lvl) => (
            <button
              type="button"
              key={lvl}
              onClick={() => setLevel(lvl)}
              className={`rounded-full border px-4 py-1.5 text-sm ${
                level === lvl
                  ? 'border-sky-500 bg-sky-500 text-white'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Not sure? A1 is total beginner — that&rsquo;s a perfectly good place to start.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold text-slate-900 dark:text-white">
          How should your tutor coach you?
        </legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50 dark:border-slate-700 dark:has-[:checked]:bg-sky-950">
          <input
            type="radio"
            name="coachingProfile"
            className="mt-1"
            checked={coachingProfile === 'confidence_first'}
            onChange={() => setCoachingProfile('confidence_first')}
          />
          <span>
            <span className="block font-medium text-slate-800 dark:text-slate-100">
              I want gentle encouragement — help me dare to speak
            </span>
            <span className="block text-sm text-slate-500 dark:text-slate-400">
              Your tutor praises what you got right, keeps corrections light, and never
              re-corrects the same small slip twice.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50 dark:border-slate-700 dark:has-[:checked]:bg-sky-950">
          <input
            type="radio"
            name="coachingProfile"
            className="mt-1"
            checked={coachingProfile === 'accuracy_focus'}
            onChange={() => setCoachingProfile('accuracy_focus')}
          />
          <span>
            <span className="block font-medium text-slate-800 dark:text-slate-100">
              Correct everything and tell me why
            </span>
            <span className="block text-sm text-slate-500 dark:text-slate-400">
              Your tutor explains every real mistake and asks follow-up questions that make
              you practice the fix.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold text-slate-900 dark:text-white">
          What do you want to focus on?
        </legend>
        <div className="flex flex-wrap gap-2">
          {focusSkillValues.map((skill) => (
            <button
              type="button"
              key={skill}
              onClick={() => toggleFocusSkill(skill)}
              className={`rounded-full border px-4 py-1.5 text-sm ${
                focusSkills.includes(skill)
                  ? 'border-sky-500 bg-sky-500 text-white'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              {FOCUS_SKILL_LABELS[skill]}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Timezone detected as {timezone} — used to time your daily streak.
      </p>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !languagePairId}
        className="rounded-full bg-sky-600 px-6 py-3 font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Start learning'}
      </button>
    </form>
  );
}
