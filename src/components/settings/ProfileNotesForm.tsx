'use client';

import { useState } from 'react';
import { PROFILE_FACTS_MAX, PROFILE_FACT_MAX_CHARS } from '@/lib/zodSchemas';
import type { ExplanationLanguage, ProfileFact } from '@/lib/db/schema';
import { t, type Locale } from '@/lib/i18n';

const EXPLANATION_LANGUAGES: ExplanationLanguage[] = ['native', 'target', 'both'];

/**
 * What the tutor knows about you, and what language it explains you to yourself in
 * (ROADMAP.md P1.5b follow-on item 6).
 *
 * Everything the tutor remembers is on this screen, editable and deletable. A memory
 * you cannot see is a memory you cannot correct - and the ones the tutor picked up on
 * its own are exactly the ones most likely to be slightly wrong.
 */
export function ProfileNotesForm({
  initial,
  locale,
}: {
  initial: {
    profileNotes: ProfileFact[] | null;
    factLearning: boolean;
    explanationLanguage: ExplanationLanguage;
  };
  locale: Locale;
}) {
  const strings = t(locale).profileNotes;
  const [facts, setFacts] = useState<ProfileFact[]>(initial.profileNotes ?? []);
  const [factLearning, setFactLearning] = useState(initial.factLearning);
  const [explanationLanguage, setExplanationLanguage] = useState(initial.explanationLanguage);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function save(next: {
    profileNotes?: ProfileFact[];
    factLearning?: boolean;
    explanationLanguage?: ExplanationLanguage;
  }) {
    setStatus('saving');
    const res = await fetch('/api/me/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => null);
    setStatus(res?.ok ? 'saved' : 'error');
  }

  function updateFact(id: string, text: string) {
    setFacts((current) => current.map((f) => (f.id === id ? { ...f, text } : f)));
  }

  function commitFacts(next: ProfileFact[]) {
    setFacts(next);
    // Blank facts are deletions by another name: an empty line in this list would
    // reach the prompt as an empty bullet.
    void save({ profileNotes: next.filter((f) => f.text.trim().length > 0) });
  }

  function addFact() {
    const text = draft.trim();
    if (text.length === 0 || facts.length >= PROFILE_FACTS_MAX) return;
    setDraft('');
    commitFacts([
      ...facts,
      { id: `f${Date.now().toString(36)}`, text: text.slice(0, PROFILE_FACT_MAX_CHARS), source: 'asked' },
    ]);
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="heading-section">{strings.heading}</h2>
        <p className="mt-1 text-sm text-ink-muted">{strings.hint}</p>
      </div>

      {facts.length === 0 ? (
        <p className="text-sm text-ink-muted">{strings.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {facts.map((fact) => (
            <li key={fact.id} className="flex items-center gap-2">
              <input
                type="text"
                value={fact.text}
                maxLength={PROFILE_FACT_MAX_CHARS}
                onChange={(e) => updateFact(fact.id, e.target.value)}
                onBlur={() => commitFacts(facts)}
                className="min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 py-2.5 text-ink shadow-card"
              />
              {/* Where a fact came from, because "the tutor decided this about me" and
                  "I typed this" are very different things to read back. */}
              <span className="shrink-0 text-xs font-bold tracking-wide text-ink-muted uppercase">
                {fact.source === 'learned' ? strings.sourceLearned : strings.sourceAsked}
              </span>
              <button
                type="button"
                onClick={() => commitFacts(facts.filter((f) => f.id !== fact.id))}
                aria-label={strings.deleteFact}
                className="shrink-0 cursor-pointer px-2 py-1 text-sm font-bold text-ink-muted"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {facts.length < PROFILE_FACTS_MAX && (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            maxLength={PROFILE_FACT_MAX_CHARS}
            placeholder={strings.addPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 py-2.5 text-ink shadow-card"
          />
          <button type="button" onClick={addFact} className="btn-secondary btn-sm shrink-0">
            {strings.addFact}
          </button>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-line bg-surface px-4 py-3.5 shadow-card has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:has-[:checked]:bg-brand-900/25">
        <input
          type="checkbox"
          className="mt-1"
          checked={factLearning}
          onChange={() => {
            const next = !factLearning;
            setFactLearning(next);
            void save({ factLearning: next });
          }}
        />
        <span>
          <span className="block font-bold text-ink">{strings.learningTitle}</span>
          <span className="block text-sm text-ink-muted">{strings.learningDesc}</span>
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <p className="font-bold text-ink">{strings.explanationHeading}</p>
        <div className="flex flex-wrap gap-2">
          {EXPLANATION_LANGUAGES.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => {
                setExplanationLanguage(option);
                void save({ explanationLanguage: option });
              }}
              className={`chip ${explanationLanguage === option ? 'chip-active' : ''}`}
            >
              {strings.explanationOptions[option]}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-ink-muted" aria-live="polite">
        {status === 'saving'
          ? strings.saving
          : status === 'saved'
            ? strings.saved
            : status === 'error'
              ? strings.saveFailed
              : ''}
      </p>
    </section>
  );
}
