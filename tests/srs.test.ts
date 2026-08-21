import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SRS,
  buildErrorPatternFront,
  buildVocabFront,
  estimateReviewMinutes,
  nextSchedule,
  type SchedulableItem,
} from '@/lib/srs';

// PLAN.md §13.3. The scheduler is the one piece of product maths that runs
// unattended for weeks: a wrong interval doesn't throw, it just quietly stops
// showing a learner the words they keep getting wrong. These tests pin the exact
// sequences §13.3 and the doc comment on `nextSchedule` promise.

const NOW = new Date('2026-08-21T12:00:00.000Z');
const DAY_MS = 86_400_000;

function fresh(overrides: Partial<SchedulableItem> = {}): SchedulableItem {
  return {
    easeFactor: SRS.DEFAULT_EASE_X100,
    intervalDays: 0,
    reps: 0,
    lapses: 0,
    ...overrides,
  };
}

describe('nextSchedule — good', () => {
  it('moves a brand-new item to tomorrow rather than to today', () => {
    const next = nextSchedule(fresh(), 'good', NOW);
    assert.equal(next.intervalDays, 1);
    assert.equal(next.dueAt.getTime(), NOW.getTime() + DAY_MS);
    assert.equal(next.reps, 1);
    assert.equal(next.lapses, 0);
    assert.equal(next.easeFactor, SRS.DEFAULT_EASE_X100, 'good leaves the ease alone');
  });

  it('runs 1 → 3 → 8 → 20 → 50 → 60 at the default ease, capping at MAX_INTERVAL_DAYS', () => {
    const seen: number[] = [];
    let item = fresh();
    for (let i = 0; i < 6; i++) {
      const next = nextSchedule(item, 'good', NOW);
      seen.push(next.intervalDays);
      item = next;
    }
    assert.deepEqual(seen, [1, 3, 8, 20, 50, 60]);
    assert.equal(SRS.MAX_INTERVAL_DAYS, 60);
  });

  it('never exceeds the cap even from an already-capped interval', () => {
    const next = nextSchedule(fresh({ intervalDays: SRS.MAX_INTERVAL_DAYS }), 'good', NOW);
    assert.equal(next.intervalDays, SRS.MAX_INTERVAL_DAYS);
  });
});

describe('nextSchedule — again', () => {
  it('brings the item back inside the same round and counts a lapse', () => {
    const next = nextSchedule(fresh({ intervalDays: 20, reps: 4 }), 'again', NOW);
    assert.equal(next.intervalDays, 0, 'the interval resets, not just the due date');
    assert.equal(next.lapses, 1);
    assert.equal(next.reps, 5);
    assert.equal(next.dueAt.getTime(), NOW.getTime() + SRS.AGAIN_RELEARN_MINUTES * 60_000);
  });

  it('knocks 0.20 off the ease but floors it at MIN_EASE_X100', () => {
    assert.equal(nextSchedule(fresh(), 'again', NOW).easeFactor, 230);

    const atFloor = nextSchedule(fresh({ easeFactor: SRS.MIN_EASE_X100 }), 'again', NOW);
    assert.equal(atFloor.easeFactor, SRS.MIN_EASE_X100, 'a hard item cannot spiral below the floor');
  });

  it('at the ease floor still schedules a real relearn step, never a zero interval', () => {
    let item: SchedulableItem = fresh();
    for (let i = 0; i < 20; i++) item = nextSchedule(item, 'again', NOW);
    assert.equal(item.easeFactor, SRS.MIN_EASE_X100);

    const recovered = nextSchedule(item, 'good', NOW);
    assert.ok(recovered.intervalDays >= SRS.MIN_GOOD_INTERVAL_DAYS);
  });
});

describe('nextSchedule — easy', () => {
  it('gives a fresh item two days', () => {
    const next = nextSchedule(fresh(), 'easy', NOW);
    assert.equal(next.intervalDays, SRS.MIN_EASY_INTERVAL_DAYS);
    assert.equal(next.dueAt.getTime(), NOW.getTime() + 2 * DAY_MS);
    assert.equal(next.lapses, 0);
  });

  it('grows the interval with the OLD ease and only then raises it', () => {
    // 20 days × 2.00 × 1.30 = 52. Had the +0.05 bump applied to the interval first
    // it would have been 20 × 2.05 × 1.30 = 53.3 → 53, so this case tells the two
    // orderings apart rather than agreeing by rounding.
    const next = nextSchedule(fresh({ intervalDays: 20, easeFactor: 200 }), 'easy', NOW);
    assert.equal(next.intervalDays, Math.round((20 * 200 * 130) / 10_000)); // 52, on the old ease
    assert.equal(next.easeFactor, 205, 'the bump lands for the NEXT grade');
  });

  it('respects the interval cap', () => {
    const next = nextSchedule(fresh({ intervalDays: 50 }), 'easy', NOW);
    assert.equal(next.intervalDays, SRS.MAX_INTERVAL_DAYS);
  });
});

describe('nextSchedule — invariants', () => {
  it('increments reps on every grade and is pure', () => {
    const item = fresh({ intervalDays: 5, reps: 2, lapses: 1 });
    const snapshot = { ...item };
    for (const outcome of ['again', 'good', 'easy'] as const) {
      const next = nextSchedule(item, outcome, NOW);
      assert.equal(next.reps, item.reps + 1, `${outcome} increments reps`);
      assert.ok(next.dueAt.getTime() > NOW.getTime(), `${outcome} schedules into the future`);
    }
    assert.deepEqual(item, snapshot, 'the input item is never mutated');
  });

  it('reads no clock of its own — the same input twice gives the same due date', () => {
    const a = nextSchedule(fresh(), 'good', NOW);
    const b = nextSchedule(fresh(), 'good', NOW);
    assert.equal(a.dueAt.getTime(), b.dueAt.getTime());
  });
});

describe('estimateReviewMinutes', () => {
  it('never promises less than a minute', () => {
    assert.equal(estimateReviewMinutes(0), 1);
    assert.equal(estimateReviewMinutes(1), 1);
  });

  it('rounds a full round to the copy the dashboard shows', () => {
    // 10 × 25s = 250s ≈ 4 minutes.
    assert.equal(estimateReviewMinutes(SRS.MAX_ITEMS_PER_ROUND), 4);
    assert.equal(estimateReviewMinutes(5), 2);
  });
});

describe('card fronts', () => {
  it('appends a vocab note only when there is one', () => {
    assert.equal(buildVocabFront({ gloss: 'the bill' }), 'the bill');
    assert.equal(buildVocabFront({ gloss: 'the bill', note: 'restaurant' }), 'the bill (restaurant)');
  });

  it('elicits the correction without giving it away', () => {
    const front = buildErrorPatternFront({
      description: 'ser/estar with locations',
      exampleQuote: 'yo soy en casa',
    });
    assert.match(front, /yo soy en casa/);
    assert.match(front, /ser\/estar with locations/);
    assert.ok(!front.includes('estoy'), 'the answer stays on the back of the card');
  });

  it('falls back to a produce-a-sentence prompt when there is no quote', () => {
    const front = buildErrorPatternFront({ description: 'ser/estar', exampleQuote: null });
    assert.match(front, /^Say a sentence that gets this right: /);
  });

  it('treats a whitespace-only quote as no quote', () => {
    const front = buildErrorPatternFront({ description: 'ser/estar', exampleQuote: '   ' });
    assert.match(front, /^Say a sentence that gets this right: /);
  });
});
