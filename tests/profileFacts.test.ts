import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addLearnedFact, factsFromOnboardingAnswers } from '@/lib/profileFacts';
import { PROFILE_FACTS_MAX, PROFILE_FACT_MAX_CHARS } from '@/lib/zodSchemas';
import type { ProfileFact } from '@/lib/db/schema';

// What the tutor is allowed to remember about someone. The rules that matter are the
// ones about NOT remembering: no duplicates, no blanks, and nothing the learner typed
// themselves getting pushed out by something the model overheard.

const fact = (text: string, source: 'asked' | 'learned' = 'learned'): ProfileFact => ({
  id: `id-${text}`,
  text,
  source,
});

describe('factsFromOnboardingAnswers', () => {
  it('turns the three answers into labelled facts', () => {
    const facts = factsFromOnboardingAnswers({
      job: 'nurse',
      city: 'Asunción',
      caresAbout: 'her garden',
    });
    assert.deepEqual(
      facts.map((f) => f.text),
      ['Work: nurse', 'Lives in: Asunción', 'Cares about: her garden'],
    );
    assert.ok(facts.every((f) => f.source === 'asked'));
    assert.equal(new Set(facts.map((f) => f.id)).size, 3, 'ids are distinct');
  });

  it('treats a blank answer as no answer', () => {
    assert.deepEqual(factsFromOnboardingAnswers({ job: '   ', city: 'Gothenburg' }).map((f) => f.text), [
      'Lives in: Gothenburg',
    ]);
    assert.deepEqual(factsFromOnboardingAnswers({}), []);
  });
});

describe('addLearnedFact', () => {
  it('adds a fact the tutor has not heard before', () => {
    const next = addLearnedFact([fact('Has a dog called Kiwi')], 'Works night shifts');
    assert.equal(next?.length, 2);
    assert.equal(next?.[1].text, 'Works night shifts');
    assert.equal(next?.[1].source, 'learned');
  });

  it('starts the list when there is nothing stored', () => {
    assert.equal(addLearnedFact(null, 'Lives in Encarnación')?.length, 1);
  });

  it('says "nothing to do" rather than storing a duplicate', () => {
    const existing = [fact('Has a dog called Kiwi')];
    assert.equal(addLearnedFact(existing, 'has a dog called kiwi'), null);
    assert.equal(addLearnedFact(existing, 'Has a dog called Kiwi.'), null);
  });

  it('says "nothing to do" on a blank', () => {
    assert.equal(addLearnedFact([], '   '), null);
  });

  it('truncates rather than letting one fact fill the prompt', () => {
    const next = addLearnedFact([], 'x'.repeat(PROFILE_FACT_MAX_CHARS + 50));
    assert.equal(next?.[0].text.length, PROFILE_FACT_MAX_CHARS);
  });

  it('evicts the oldest learned fact at the cap, never one the learner typed', () => {
    const existing: ProfileFact[] = [
      fact('Work: nurse', 'asked'),
      ...Array.from({ length: PROFILE_FACTS_MAX - 1 }, (_, i) => fact(`learned ${i}`)),
    ];
    const next = addLearnedFact(existing, 'brand new');
    assert.equal(next?.length, PROFILE_FACTS_MAX);
    assert.ok(
      next?.some((f) => f.text === 'Work: nurse'),
      'a fact the learner typed survives',
    );
    assert.ok(!next?.some((f) => f.text === 'learned 0'), 'the oldest learned fact makes way');
    assert.ok(next?.some((f) => f.text === 'brand new'));
  });
});
