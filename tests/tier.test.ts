import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PracticeMode, UserTier } from '@/lib/db/schema';
import { tierAllowsMode } from '@/lib/tier';

// PLAN.md §15.3 — "build the gate, not the commerce". The gate is one predicate, and
// the thing it must never do is gate the $0 core product: lessons and reviews are the
// app, and gating them would gate the app itself.

const MODES: PracticeMode[] = ['lesson', 'live', 'review'];
const TIERS: UserTier[] = ['free', 'premium'];

describe('tierAllowsMode', () => {
  it('never gates lessons or reviews, on any tier', () => {
    for (const tier of TIERS) {
      assert.equal(tierAllowsMode(tier, 'lesson'), true);
      assert.equal(tierAllowsMode(tier, 'review'), true);
    }
  });

  it('gates live for free users', () => {
    assert.equal(tierAllowsMode('free', 'live'), false);
  });

  it('opens everything for premium', () => {
    for (const mode of MODES) {
      assert.equal(tierAllowsMode('premium', mode), true);
    }
  });
});
