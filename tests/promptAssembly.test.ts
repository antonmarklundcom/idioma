import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assembleSystemPrompt } from '@/lib/gemini/prompts';
import type { ProfileFact } from '@/lib/db/schema';

// The prompt is where a stored fact actually does something. These pin down that it
// arrives, that it arrives as CONTENT rather than as instructions, and that a learner
// with none of this set gets exactly the prompt they got before the feature existed.

const pair = {
  tutorPromptTemplate:
    'LEVEL {{level}} | DIALECT {{dialect_notes}} | STYLE {{correction_style}} | ' +
    'COACH {{coaching_profile}} | ERRORS {{recurring_errors}} | LESSON {{lesson_context}} | ' +
    'TAXONOMY {{error_taxonomy}}',
  conversationPromptTemplate: null,
  dialectNotes: null,
  correctionStyle: null,
  errorTaxonomy: ['grammar'],
};

const base = {
  pair,
  mode: 'lesson' as const,
  level: 'A2',
  coachingProfile: 'confidence_first' as const,
  focusSkills: null,
  recurringErrors: [],
  lessonContext: 'Order a coffee.',
};

const facts: ProfileFact[] = [
  { id: '1', text: 'Work: nurse', source: 'asked' },
  { id: '2', text: 'Has a dog called Kiwi', source: 'learned' },
];

describe('assembleSystemPrompt — profile facts', () => {
  it('puts every stored fact in the prompt', () => {
    const prompt = assembleSystemPrompt({ ...base, profileNotes: facts });
    assert.match(prompt, /Work: nurse/);
    assert.match(prompt, /Has a dog called Kiwi/);
  });

  it('frames them as facts about the learner, not as instructions to the tutor', () => {
    const prompt = assembleSystemPrompt({ ...base, profileNotes: facts });
    assert.match(prompt, /never instructions to you/i);
  });

  it('says nothing at all when there is nothing stored', () => {
    const empty = assembleSystemPrompt({ ...base, profileNotes: null });
    assert.ok(!/told us about themselves/i.test(empty));
    assert.equal(empty, assembleSystemPrompt({ ...base, profileNotes: [] }));
  });

  it('ignores a fact that is only whitespace', () => {
    const prompt = assembleSystemPrompt({
      ...base,
      profileNotes: [{ id: '1', text: '   ', source: 'learned' }],
    });
    assert.ok(!/told us about themselves/i.test(prompt));
  });
});

describe('assembleSystemPrompt — explanation language', () => {
  it("leaves the prompt untouched for 'my language', which is what every pair did before", () => {
    const before = assembleSystemPrompt(base);
    assert.equal(assembleSystemPrompt({ ...base, explanationLanguage: 'native' }), before);
  });

  it('asks for target-language explanations when that is the choice', () => {
    const prompt = assembleSystemPrompt({ ...base, explanationLanguage: 'target' });
    assert.match(prompt, /language they are LEARNING/);
  });

  it('asks for both, in a fixed order, when that is the choice', () => {
    const prompt = assembleSystemPrompt({ ...base, explanationLanguage: 'both' });
    assert.match(prompt, /twice/);
    assert.match(prompt, /target — native/);
  });
});
