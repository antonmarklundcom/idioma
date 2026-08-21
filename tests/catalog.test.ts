import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  KNOWN_MODELS,
  LLM_TASKS,
  PROVIDERS,
  PROVIDER_IDS,
  TASK_DESCRIPTIONS,
  TASK_LABELS,
  estimateCostPer100Turns,
  findModel,
  listModels,
} from '@/lib/llm/catalog';

// PLAN.md §14.4. The catalog's stated commitment is that it never puts an invented
// number in front of the person deciding what to spend: an unverified price is
// `null` all the way through to "unknown" in /admin, never a guess. §10.7 adds the
// other half — a model ID this file has never heard of must still work.

const ORIGINAL = process.env.OPENAI_FEEDBACK_MODELS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.OPENAI_FEEDBACK_MODELS;
  else process.env.OPENAI_FEEDBACK_MODELS = ORIGINAL;
});

describe('catalog shape', () => {
  it('describes every task and provider it declares', () => {
    for (const task of LLM_TASKS) {
      assert.ok(TASK_LABELS[task]?.trim(), `${task} has no label`);
      assert.ok(TASK_DESCRIPTIONS[task]?.trim(), `${task} has no description`);
    }
    for (const id of PROVIDER_IDS) {
      const spec = PROVIDERS[id];
      assert.equal(spec.id, id, 'the record key and the spec id must agree');
      assert.match(spec.apiKeyEnvVar, /^[A-Z0-9_]+$/, `${id}'s key env var is not an env var name`);
      assert.match(spec.pricingUrl, /^https:\/\//, `${id}'s pricing link is not a URL`);
    }
  });

  it('keeps model ids unique per provider and prices paired', () => {
    const seen = new Set<string>();
    for (const model of KNOWN_MODELS) {
      const key = `${model.providerId}:${model.id}`;
      assert.ok(!seen.has(key), `duplicate model ${key}`);
      seen.add(key);
      assert.ok(PROVIDER_IDS.includes(model.providerId), `${key} names an unknown provider`);
      assert.equal(
        model.inputPricePerMTok === null,
        model.outputPricePerMTok === null,
        `${key} has half a price — the UI can only say "known" or "unknown", not both`,
      );
      assert.ok(model.notes.trim(), `${key} has no note explaining what it is`);
    }
  });

  it('lists no OpenAI model with a price this repo never verified (§14.4)', () => {
    for (const model of KNOWN_MODELS.filter((m) => m.providerId === 'openai')) {
      assert.equal(model.inputPricePerMTok, null, `${model.id} carries an unverified price`);
    }
  });
});

describe('listModels / findModel', () => {
  it('picks up models named in OPENAI_FEEDBACK_MODELS, priced as unknown', () => {
    process.env.OPENAI_FEEDBACK_MODELS = ' gpt-x-mini , gpt-x ';
    const added = listModels().filter((m) => m.providerId === 'openai');
    assert.deepEqual(added.map((m) => m.id), ['gpt-x-mini', 'gpt-x']);
    for (const model of added) {
      assert.equal(model.inputPricePerMTok, null);
      assert.equal(model.freeTier, false, 'an env-listed model is not assumed free');
    }
  });

  it('ignores empty entries rather than listing a blank model', () => {
    process.env.OPENAI_FEEDBACK_MODELS = 'gpt-x,,  ,';
    assert.deepEqual(
      listModels().filter((m) => m.providerId === 'openai').map((m) => m.id),
      ['gpt-x'],
    );
  });

  it('falls back to the known models when the env var is unset', () => {
    delete process.env.OPENAI_FEEDBACK_MODELS;
    assert.deepEqual(listModels(), KNOWN_MODELS);
  });

  it('matches on provider AND id, so two providers may share a model name', () => {
    process.env.OPENAI_FEEDBACK_MODELS = 'gemini-3.6-flash';
    assert.equal(findModel('gemini', 'gemini-3.6-flash')?.inputPricePerMTok, 1.5);
    assert.equal(findModel('openai', 'gemini-3.6-flash')?.inputPricePerMTok, null);
  });

  it('returns undefined for a model it has never heard of, rather than throwing', () => {
    assert.equal(findModel('gemini', 'gemini-99-ultra'), undefined);
  });
});

describe('estimateCostPer100Turns (§14.4: never invent a number)', () => {
  it('says "unknown" for an unpriced or unknown model', () => {
    assert.equal(estimateCostPer100Turns(undefined), null);
    assert.equal(estimateCostPer100Turns(findModel('gemini', 'gemini-flash-latest')), null);
  });

  it('estimates a priced model from the documented per-turn token shape', () => {
    const estimate = estimateCostPer100Turns(findModel('gemini', 'gemini-3.6-flash'));
    assert.ok(estimate, 'a fully priced model must produce an estimate');
    // 3000 in @ $1.50/Mtok + 400 out @ $7.50/Mtok = $0.0075/turn → $0.75 per 100.
    assert.ok(Math.abs(estimate.per100Turns - 0.75) < 1e-9, `got ${estimate.per100Turns}`);
  });

  it('scales with price rather than returning a constant', () => {
    const base = findModel('gemini', 'gemini-3.6-flash');
    assert.ok(base);
    const doubled = estimateCostPer100Turns({
      ...base,
      inputPricePerMTok: base.inputPricePerMTok! * 2,
      outputPricePerMTok: base.outputPricePerMTok! * 2,
    });
    assert.ok(Math.abs(doubled!.per100Turns - 1.5) < 1e-9);
  });

  it('treats a free model as free, not as unknown', () => {
    const free = estimateCostPer100Turns({
      ...KNOWN_MODELS[0],
      inputPricePerMTok: 0,
      outputPricePerMTok: 0,
    });
    assert.deepEqual(free, { per100Turns: 0 });
  });
});
