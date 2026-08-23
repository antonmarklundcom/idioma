import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateMonthlyUsd, mistakesPerTurn } from '@/lib/adminLearners';

// The two numbers on a learner card that are arithmetic rather than a column read.

describe('mistakesPerTurn', () => {
  it('averages over turns rather than counting mistakes', () => {
    assert.equal(mistakesPerTurn(10, 5), 0.5);
    assert.equal(mistakesPerTurn(4, 0), 0);
  });

  it('is null with no turns — not zero, which would read as a perfect week', () => {
    assert.equal(mistakesPerTurn(0, 0), null);
  });
});

describe('estimateMonthlyUsd', () => {
  it('is zero for a learner who has done nothing', () => {
    assert.equal(estimateMonthlyUsd({ attempts: 0, ttsChars: 0 }), 0);
  });

  it('prices TTS at the rate past the free allotment ($16 per million chars)', () => {
    assert.equal(estimateMonthlyUsd({ attempts: 0, ttsChars: 1_000_000 }), 16);
  });

  it('rounds to cents, so the card never shows a fraction of one', () => {
    const value = estimateMonthlyUsd({ attempts: 137, ttsChars: 45_321 });
    assert.equal(Math.round(value * 100), value * 100);
  });
});
