import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isUnderMonthlyTtsCharCapFor } from '@/lib/usage';

// PLAN.md §16 defect 2 / §6.12. Cloud TTS lives in the BILLED Google project, so this
// predicate is the only thing between the project and a silent $16/1M-char bill. The
// numbers are internal to lib/usage.ts on purpose (one place, no drift), so these tests
// pin the behaviour that matters rather than re-declaring the constants: where the line
// sits relative to the 1M free allotment, and that the pending reply is counted before
// the call, not after it.

const FREE_ALLOTMENT = 1_000_000;

function findStop(): number {
  // Binary search the last value that passes — the stop point, whatever §16's 80%
  // derivation currently evaluates to.
  let low = 0;
  let high = FREE_ALLOTMENT * 2;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (isUnderMonthlyTtsCharCapFor(mid)) low = mid;
    else high = mid - 1;
  }
  return low;
}

describe('isUnderMonthlyTtsCharCapFor', () => {
  const stop = findStop();

  it('stops well below the free allotment, leaving headroom for concurrent overshoot', () => {
    assert.ok(stop < FREE_ALLOTMENT, 'synthesis must stop before Google starts billing');
    assert.ok(
      FREE_ALLOTMENT - stop >= 100_000,
      `only ${FREE_ALLOTMENT - stop} chars of headroom below the billed threshold`,
    );
  });

  it('allows an untouched month', () => {
    assert.equal(isUnderMonthlyTtsCharCapFor(0), true);
    assert.equal(isUnderMonthlyTtsCharCapFor(0, 300), true);
  });

  it('is inclusive at the stop point and false one character past it', () => {
    assert.equal(isUnderMonthlyTtsCharCapFor(stop), true);
    assert.equal(isUnderMonthlyTtsCharCapFor(stop + 1), false);
  });

  it('counts the pending reply BEFORE deciding, so a request never knowingly crosses', () => {
    assert.equal(isUnderMonthlyTtsCharCapFor(stop - 300, 300), true);
    assert.equal(isUnderMonthlyTtsCharCapFor(stop - 300, 301), false);
  });

  it('treats a missing pending count as zero', () => {
    assert.equal(isUnderMonthlyTtsCharCapFor(stop), isUnderMonthlyTtsCharCapFor(stop, 0));
  });

  it('stays closed once the month is over the line', () => {
    assert.equal(isUnderMonthlyTtsCharCapFor(FREE_ALLOTMENT), false);
    assert.equal(isUnderMonthlyTtsCharCapFor(FREE_ALLOTMENT * 5), false);
  });
});
