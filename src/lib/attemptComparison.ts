/**
 * Attempt 1 vs attempt 2 (ROADMAP.md P1.5b follow-on).
 *
 * The retry loop replaces one result with another, which hides the only thing the
 * retry is for: whether the second go was better. These helpers keep the comparison
 * in one testable place - the player holds both counts, this decides what they mean.
 */

export type AttemptTrend = 'improved' | 'same' | 'worse';

/** What the second attempt did to the first one's mistake count. */
export function attemptTrend(firstErrorCount: number, latestErrorCount: number): AttemptTrend {
  if (latestErrorCount < firstErrorCount) return 'improved';
  if (latestErrorCount > firstErrorCount) return 'worse';
  return 'same';
}

/** One exercise's outcome, as far as the comparison is concerned. */
export type AttemptRecord = {
  /** Mistakes on the first go - never overwritten by a retry. */
  firstErrorCount: number;
  /** Mistakes on the most recent go. Equal to the first until a retry lands. */
  errorCount: number;
  attempts: number;
};

/**
 * How many retried exercises ended up with fewer mistakes than they started with.
 * Exercises answered once are not counted either way: there is nothing to compare.
 */
export function countImprovedRetries(records: AttemptRecord[]): {
  improved: number;
  retried: number;
} {
  const retried = records.filter((r) => r.attempts > 1);
  return {
    improved: retried.filter((r) => attemptTrend(r.firstErrorCount, r.errorCount) === 'improved')
      .length,
    retried: retried.length,
  };
}
