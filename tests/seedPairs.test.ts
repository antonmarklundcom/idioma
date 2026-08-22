import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SEED_PAIRS } from '../scripts/seedPairs';
import {
  FREE_PRACTICE_LESSON_CONTEXT,
  QUICK_REPLY_INSTRUCTION,
  assembleSystemPrompt,
  buildReviewPromptContext,
} from '@/lib/gemini/prompts';

// PLAN.md §10.3 calls the controlled `patternKey` taxonomy "the single most important
// design detail for the app's stated long-term value" — without it the dashboard
// degenerates into one row per occurrence. The taxonomy reaches the model through a
// {{error_taxonomy}} slot in a template that lives in seed DATA, substituted by code
// in another file. Nothing but a test connects those two halves: a template that
// spells a slot differently ships a literal "{{error_taxonomy}}" to Gemini, and the
// only symptom is a dashboard that slowly fills with junk.

const PROFILES = ['confidence_first', 'accuracy_focus'] as const;

function slotsIn(template: string): string[] {
  return [...template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
}

function assemble(pair: (typeof SEED_PAIRS)[number], mode: 'lesson' | 'live' | 'review') {
  return assembleSystemPrompt({
    pair,
    mode,
    level: 'A2',
    coachingProfile: 'confidence_first',
      focusSkills: null,
    recurringErrors: [{ category: 'grammar', description: 'ser vs estar with locations' }],
    lessonContext: 'Ordering at a café.',
  });
}

describe('every seeded pair', () => {
  it('is one row of data, not a code path (§0: no pair-specific branches)', () => {
    assert.equal(SEED_PAIRS.length, 3, 'three launch pairs, PLAN.md §9 Q12');
    const codes = SEED_PAIRS.map((p) => p.code);
    assert.equal(new Set(codes).size, codes.length, 'pair codes must be unique');
    for (const pair of SEED_PAIRS) {
      assert.ok(pair.ttsVoice, `${pair.code} has no tutor voice (§4.5)`);
      assert.ok(pair.dialectNotes?.trim(), `${pair.code} has no dialect notes`);
      assert.ok(pair.correctionStyle?.trim(), `${pair.code} has no correction style`);
      assert.ok(pair.conversationPromptTemplate?.trim(), `${pair.code} cannot run live mode`);
    }
  });

  it('has a usable error taxonomy with an "other" escape hatch', () => {
    for (const pair of SEED_PAIRS) {
      const keys = pair.errorTaxonomy;
      assert.ok(keys.length >= 5, `${pair.code}'s taxonomy is too thin to group anything`);
      assert.equal(new Set(keys).size, keys.length, `${pair.code} has duplicate pattern keys`);
      assert.ok(
        keys.includes('other'),
        `${pair.code} has no "other" key — the model would be forced to mislabel`,
      );
      for (const key of keys) {
        // The key is a database identity (§3.3 unique index) and is rendered in the
        // dashboard: it has to survive a round trip through JSON and a URL unchanged.
        assert.match(key, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${pair.code}: "${key}" is not a stable key`);
      }
    }
  });
});

describe('template ↔ assembler contract', () => {
  for (const pair of SEED_PAIRS) {
    for (const mode of ['lesson', 'live'] as const) {
      it(`${pair.code} (${mode}) leaves no slot unsubstituted`, () => {
        const prompt = assemble(pair, mode);
        assert.ok(
          !prompt.includes('{{'),
          `unsubstituted slot(s) reached the model: ${slotsIn(prompt).join(', ')}`,
        );
      });
    }

    it(`${pair.code} injects the taxonomy, the level and the recurring errors`, () => {
      const prompt = assemble(pair, 'lesson');
      for (const key of pair.errorTaxonomy) {
        assert.ok(prompt.includes(key), `pattern key "${key}" never reached the prompt`);
      }
      assert.ok(prompt.includes('A2'), 'the level never reached the prompt');
      assert.ok(prompt.includes('ser vs estar with locations'), 'recurring errors never arrived');
      assert.ok(prompt.includes('Ordering at a café.'), 'the lesson context never arrived');
      assert.ok(prompt.includes(pair.dialectNotes), 'the dialect notes never arrived');
    });

    it(`${pair.code} passes the learner's focus skills through to the tutor`, () => {
      // The setting existed in onboarding and /settings from Phase 2 and reached
      // nothing; this is the assertion that it now does.
      const withFocus = assembleSystemPrompt({
        pair,
        mode: 'lesson',
        level: 'A1',
        coachingProfile: 'confidence_first',
        focusSkills: ['pronunciation', 'listening'],
        recurringErrors: [],
        lessonContext: 'x',
      });
      assert.match(withFocus, /pronunciation error pass/);
      assert.match(withFocus, /followUpQuestion something they must/);

      const without = assembleSystemPrompt({
        pair,
        mode: 'lesson',
        level: 'A1',
        coachingProfile: 'confidence_first',
        focusSkills: null,
        recurringErrors: [],
        lessonContext: 'x',
      });
      assert.ok(!without.includes('what they want to work on'), 'invented a focus nobody chose');
    });

    it(`${pair.code} carries a coaching-profile slot that actually varies (§11.3)`, () => {
      const rendered = PROFILES.map((coachingProfile) =>
        assembleSystemPrompt({
          pair,
          mode: 'lesson',
          level: 'A1',
          coachingProfile,
          focusSkills: null,
          recurringErrors: [],
          lessonContext: 'x',
        }),
      );
      assert.notEqual(rendered[0], rendered[1], 'both profiles produce the same prompt');
    });
  }

  it('spells every slot the way the assembler does — in both directions', () => {
    // The forward half is covered above (nothing is left unsubstituted). This is the
    // reverse: the assembler must not be quietly substituting a slot no template has,
    // which is how a rename ends up half-done.
    const declared = new Set(
      SEED_PAIRS.flatMap((p) => [
        ...slotsIn(p.tutorPromptTemplate),
        ...slotsIn(p.conversationPromptTemplate),
      ]),
    );
    const substituted = new Set([
      'level',
      'dialect_notes',
      'correction_style',
      'coaching_profile',
      'recurring_errors',
      'lesson_context',
      'error_taxonomy',
    ]);
    for (const slot of declared) {
      assert.ok(substituted.has(slot), `no template slot "${slot}" is substituted by the assembler`);
    }
    for (const slot of substituted) {
      assert.ok(declared.has(slot), `the assembler substitutes "${slot}", which no template uses`);
    }
  });
});

describe('mode selection', () => {
  it('uses the conversation template for live and the tutor template for lesson', () => {
    for (const pair of SEED_PAIRS) {
      assert.notEqual(assemble(pair, 'lesson'), assemble(pair, 'live'));
    }
  });

  it('runs a review drill on the LESSON template — a drill is not a conversation (§13.4)', () => {
    for (const pair of SEED_PAIRS) {
      assert.equal(assemble(pair, 'review'), assemble(pair, 'lesson'));
    }
  });

  it('falls back to the tutor template when a pair has no conversation template', () => {
    const [pair] = SEED_PAIRS;
    const prompt = assembleSystemPrompt({
      pair: { ...pair, conversationPromptTemplate: null },
      mode: 'live',
      level: 'A2',
      coachingProfile: 'confidence_first',
      focusSkills: null,
      recurringErrors: [],
      lessonContext: FREE_PRACTICE_LESSON_CONTEXT,
    });
    assert.ok(!prompt.includes('{{'), 'the fallback must still substitute every slot');
  });
});

describe('defaults for a learner with no history', () => {
  it('tells the model not to invent recurring errors', () => {
    const prompt = assembleSystemPrompt({
      pair: SEED_PAIRS[0],
      mode: 'lesson',
      level: 'A1',
      coachingProfile: null,
      focusSkills: null,
      recurringErrors: [],
      lessonContext: FREE_PRACTICE_LESSON_CONTEXT,
    });
    assert.match(prompt, /don't invent any/i);
    assert.ok(!prompt.includes('{{'));
  });

  it('defaults a missing coaching profile rather than rendering "undefined"', () => {
    const prompt = assembleSystemPrompt({
      pair: SEED_PAIRS[0],
      mode: 'lesson',
      level: 'A1',
      coachingProfile: null,
      focusSkills: null,
      recurringErrors: [],
      lessonContext: 'x',
    });
    assert.ok(!prompt.includes('undefined'));
    // §11.3/§9 Q9: the anxious-learner profile is the safe default of the two.
    assert.match(prompt, /confidence to speak/i);
  });

  it('substitutes stand-ins for a pair missing dialect notes or correction style', () => {
    const prompt = assembleSystemPrompt({
      pair: { ...SEED_PAIRS[0], dialectNotes: null, correctionStyle: null },
      mode: 'lesson',
      level: 'A1',
      coachingProfile: 'accuracy_focus',
      focusSkills: null,
      recurringErrors: [],
      lessonContext: 'x',
    });
    assert.ok(!prompt.includes('{{'));
    assert.ok(!prompt.includes('null'));
  });
});

describe('server-assembled prompt contexts', () => {
  it('puts the expected answer in the review context and marks it as a drill (§13.4)', () => {
    const context = buildReviewPromptContext({ front: 'the bill (restaurant)', back: 'la cuenta' });
    assert.match(context, /the bill \(restaurant\)/);
    assert.match(context, /la cuenta/);
    assert.match(context, /not a conversation/i);
  });

  it('keeps the quick-reply instruction speakable — it is read aloud (§7B)', () => {
    assert.match(QUICK_REPLY_INSTRUCTION, /no markdown/i);
    assert.match(QUICK_REPLY_INSTRUCTION, /do not list errors/i);
    assert.ok(QUICK_REPLY_INSTRUCTION.startsWith('\n\n'), 'it is appended to an existing prompt');
  });

  it('gives free practice a lesson context instead of an empty slot', () => {
    assert.ok(FREE_PRACTICE_LESSON_CONTEXT.trim().length > 0);
  });
});
