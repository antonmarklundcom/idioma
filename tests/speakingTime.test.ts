import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeSpeakingTime } from '@/lib/speakingTime';

// The dashboard line "you spoke N minutes this week". The awkward cases are the small
// ones: 40 seconds of speaking is not "0 minutes", and no speaking at all should not
// print a zero at someone.

describe('describeSpeakingTime', () => {
  it('says nothing at all when nobody has spoken', () => {
    assert.deepEqual(describeSpeakingTime(0), { kind: 'none' });
  });

  it('never rounds real speaking down to zero minutes', () => {
    assert.deepEqual(describeSpeakingTime(1), { kind: 'under_a_minute' });
    assert.deepEqual(describeSpeakingTime(59), { kind: 'under_a_minute' });
  });

  it('rounds to the nearest minute past that', () => {
    assert.deepEqual(describeSpeakingTime(60), { kind: 'minutes', minutes: 1 });
    assert.deepEqual(describeSpeakingTime(119), { kind: 'minutes', minutes: 2 });
    assert.deepEqual(describeSpeakingTime(1800), { kind: 'minutes', minutes: 30 });
  });

  it('does not crash on nonsense from an empty aggregate', () => {
    assert.deepEqual(describeSpeakingTime(Number.NaN), { kind: 'none' });
    assert.deepEqual(describeSpeakingTime(-30), { kind: 'none' });
  });
});
