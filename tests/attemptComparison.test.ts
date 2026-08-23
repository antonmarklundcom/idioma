import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { attemptTrend, countImprovedRetries, type AttemptRecord } from '@/lib/attemptComparison';

// The retry replaces one result with another. These helpers are what stops the
// replacement from hiding whether the second attempt was any better than the first.

const record = (firstErrorCount: number, errorCount: number, attempts: number): AttemptRecord => ({
  firstErrorCount,
  errorCount,
  attempts,
});

describe('attemptTrend', () => {
  it('calls fewer mistakes an improvement', () => {
    assert.equal(attemptTrend(3, 0), 'improved');
    assert.equal(attemptTrend(1, 0), 'improved');
  });

  it('calls an equal count the same, clean runs included', () => {
    assert.equal(attemptTrend(2, 2), 'same');
    assert.equal(attemptTrend(0, 0), 'same');
  });

  it('does not dress up a worse second attempt', () => {
    assert.equal(attemptTrend(0, 2), 'worse');
  });
});

describe('countImprovedRetries', () => {
  it('ignores exercises that were only answered once', () => {
    const counts = countImprovedRetries([record(3, 3, 1), record(0, 0, 1)]);
    assert.deepEqual(counts, { improved: 0, retried: 0 });
  });

  it('counts only the retries that got better', () => {
    const counts = countImprovedRetries([
      record(3, 0, 2), // improved
      record(1, 1, 2), // same
      record(0, 2, 2), // worse
      record(4, 4, 1), // not retried
    ]);
    assert.deepEqual(counts, { improved: 1, retried: 3 });
  });

  it('handles a lesson where nothing was attempted', () => {
    assert.deepEqual(countImprovedRetries([]), { improved: 0, retried: 0 });
  });
});
