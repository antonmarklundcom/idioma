import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GAMIFICATION,
  computeTurnStats,
  type TurnStatsSnapshot,
} from '@/lib/gamification';

// PLAN.md §12.2. `computeTurnStats` is the whole XP/streak decision with the I/O
// lifted out, so everything §12.2 promises — the shield, the timezone rule, the
// milestones, the once-per-day goal — is testable without a database.

type StatsRow = TurnStatsSnapshot['stats'];

function snapshot(args: {
  priorTurnsToday?: number;
  timezone?: string;
  stats?: Partial<StatsRow>;
} = {}): TurnStatsSnapshot {
  const stats = {
    userId: 'u1',
    xpTotal: 0,
    currentStreak: 0,
    longestStreak: 0,
    dailyGoalTarget: GAMIFICATION.DEFAULT_DAILY_GOAL_TARGET,
    lastGoalMetDate: null,
    streakShieldUsedInWeek: null,
    updatedAt: new Date('2026-08-21T00:00:00.000Z'),
    ...args.stats,
  } as unknown as StatsRow;

  return {
    stats,
    priorTurnsToday: args.priorTurnsToday ?? 0,
    timezone: args.timezone ?? 'UTC',
  };
}

const NOON_UTC = new Date('2026-08-21T12:00:00.000Z');

describe('XP per turn', () => {
  it('awards the base turn XP', () => {
    const { result } = computeTurnStats({ snapshot: snapshot(), hadZeroErrors: false, now: NOON_UTC });
    assert.equal(result.xpAwarded, GAMIFICATION.XP_PER_TURN);
    assert.equal(result.turnsToday, 1, 'this turn counts itself');
  });

  it('adds the clean-turn bonus', () => {
    const { result } = computeTurnStats({ snapshot: snapshot(), hadZeroErrors: true, now: NOON_UTC });
    assert.equal(result.xpAwarded, GAMIFICATION.XP_PER_TURN + GAMIFICATION.XP_ZERO_ERROR_BONUS);
  });

  it('reports a total that folds this turn into the stored one', () => {
    const { result } = computeTurnStats({
      snapshot: snapshot({ stats: { xpTotal: 120 } }),
      hadZeroErrors: false,
      now: NOON_UTC,
    });
    assert.equal(result.xpTotal, 120 + GAMIFICATION.XP_PER_TURN);
  });

  it('hands the persist step the same delta it showed the learner, not an absolute total', () => {
    const { result, nextState } = computeTurnStats({
      snapshot: snapshot({ stats: { xpTotal: 500 } }),
      hadZeroErrors: true,
      now: NOON_UTC,
    });
    assert.equal(nextState.xpAwarded, result.xpAwarded);
    assert.ok(nextState.xpAwarded < result.xpTotal, 'the write is an increment (§12.2), not a set');
  });
});

describe('daily goal', () => {
  it('does not fire below the target', () => {
    const { result } = computeTurnStats({
      snapshot: snapshot({ priorTurnsToday: 1 }), // this turn makes 2 of 3
      hadZeroErrors: false,
      now: NOON_UTC,
    });
    assert.equal(result.dailyGoalMet, false);
    assert.equal(result.xpAwarded, GAMIFICATION.XP_PER_TURN);
    assert.equal(result.currentStreak, 0);
  });

  it('fires on the turn that reaches the target and pays the bonus once', () => {
    const { result } = computeTurnStats({
      snapshot: snapshot({ priorTurnsToday: 2 }), // this turn makes 3 of 3
      hadZeroErrors: false,
      now: NOON_UTC,
    });
    assert.equal(result.dailyGoalMet, true);
    assert.equal(result.xpAwarded, GAMIFICATION.XP_PER_TURN + GAMIFICATION.XP_DAILY_GOAL_MET);
    assert.equal(result.currentStreak, 1);
  });

  it('pays the goal bonus only on the first crossing of the day', () => {
    const { result } = computeTurnStats({
      snapshot: snapshot({
        priorTurnsToday: 9,
        stats: { lastGoalMetDate: '2026-08-21', currentStreak: 4, longestStreak: 9 },
      }),
      hadZeroErrors: false,
      now: NOON_UTC,
    });
    assert.equal(result.dailyGoalMet, true);
    assert.equal(result.xpAwarded, GAMIFICATION.XP_PER_TURN, 'no second +15 today');
    assert.equal(result.currentStreak, 4, 'and the streak does not double-count');
  });

  it('honours a custom target', () => {
    const { result } = computeTurnStats({
      snapshot: snapshot({ priorTurnsToday: 0, stats: { dailyGoalTarget: 1 } }),
      hadZeroErrors: false,
      now: NOON_UTC,
    });
    assert.equal(result.dailyGoalMet, true);
  });
});

describe('streak transitions (§12.2)', () => {
  function crossGoal(stats: Partial<StatsRow>, now = NOON_UTC) {
    return computeTurnStats({
      snapshot: snapshot({ priorTurnsToday: 2, stats }),
      hadZeroErrors: false,
      now,
    });
  }

  it('continues on consecutive days', () => {
    const { result } = crossGoal({ lastGoalMetDate: '2026-08-20', currentStreak: 6, longestStreak: 6 });
    assert.equal(result.currentStreak, 7);
    assert.equal(result.longestStreak, 7);
  });

  it('bridges one missed day with the weekly shield and marks it used', () => {
    const { result, nextState } = crossGoal({
      lastGoalMetDate: '2026-08-19', // one full day missed
      currentStreak: 11,
      longestStreak: 20,
    });
    assert.equal(result.currentStreak, 12, 'the shield saved it');
    assert.equal(result.longestStreak, 20, 'longest is a high-water mark, not a copy');
    assert.equal(nextState.streakShieldUsedInWeek, '2026-W34');
  });

  it('does not bridge twice in the same ISO week', () => {
    const { result } = crossGoal({
      lastGoalMetDate: '2026-08-19',
      currentStreak: 11,
      streakShieldUsedInWeek: '2026-W34',
    });
    assert.equal(result.currentStreak, 1, 'one shield per week, then the streak resets');
  });

  it('gives the shield back in a new ISO week', () => {
    const { result, nextState } = crossGoal({
      lastGoalMetDate: '2026-08-19',
      currentStreak: 11,
      streakShieldUsedInWeek: '2026-W33', // last week
    });
    assert.equal(result.currentStreak, 12);
    assert.equal(nextState.streakShieldUsedInWeek, '2026-W34');
  });

  it('resets after two missed days even with the shield available', () => {
    // The shield bridges ONE missed day (§12.2), not a weekend off — that is the
    // difference between a forgiving mechanic and a streak that never breaks.
    const { result, nextState } = crossGoal({
      lastGoalMetDate: '2026-08-18', // gap of 3: the 19th and 20th both missed
      currentStreak: 30,
      longestStreak: 30,
    });
    assert.equal(result.currentStreak, 1);
    assert.equal(result.longestStreak, 30, 'the record survives the reset');
    assert.equal(nextState.streakShieldUsedInWeek, null, 'and the shield is not spent on it');
  });

  it('resets after a long absence', () => {
    const { result } = crossGoal({ lastGoalMetDate: '2026-07-01', currentStreak: 30, longestStreak: 30 });
    assert.equal(result.currentStreak, 1);
  });

  it('starts at 1 for a learner who has never met the goal', () => {
    const { result } = crossGoal({ lastGoalMetDate: null });
    assert.equal(result.currentStreak, 1);
    assert.equal(result.longestStreak, 1);
  });
});

describe('celebrations (§12.1: milestones only, never shame)', () => {
  it('fires exactly on a §12.2 milestone', () => {
    for (const milestone of GAMIFICATION.STREAK_MILESTONES) {
      const { result } = computeTurnStats({
        snapshot: snapshot({
          priorTurnsToday: 2,
          stats: { lastGoalMetDate: '2026-08-20', currentStreak: milestone - 1 },
        }),
        hadZeroErrors: false,
        now: NOON_UTC,
      });
      assert.deepEqual(result.celebration, { type: 'streak_milestone', milestone });
    }
  });

  it('stays silent on an ordinary day', () => {
    const { result } = computeTurnStats({
      snapshot: snapshot({
        priorTurnsToday: 2,
        stats: { lastGoalMetDate: '2026-08-20', currentStreak: 4 },
      }),
      hadZeroErrors: false,
      now: NOON_UTC,
    });
    assert.equal(result.celebration, null);
  });

  it('does not re-fire on a later turn of the same milestone day', () => {
    const { result } = computeTurnStats({
      snapshot: snapshot({
        priorTurnsToday: 8,
        stats: { lastGoalMetDate: '2026-08-21', currentStreak: 7 },
      }),
      hadZeroErrors: false,
      now: NOON_UTC,
    });
    assert.equal(result.celebration, null);
  });
});

describe("timezone (§12.2: the USER's day, never server UTC)", () => {
  // 2026-08-21T02:00Z is still the 20th in Asunción (UTC−4 / −3) and already the
  // 21st in Stockholm (UTC+2). The two beta users must not corrupt each other.
  const EARLY_UTC = new Date('2026-08-21T02:00:00.000Z');

  it('counts the goal against the local date in Asunción', () => {
    const { nextState } = computeTurnStats({
      snapshot: snapshot({ priorTurnsToday: 2, timezone: 'America/Asuncion' }),
      hadZeroErrors: false,
      now: EARLY_UTC,
    });
    assert.equal(nextState.lastGoalMetDate, '2026-08-20');
  });

  it('counts the same instant as the next day in Stockholm', () => {
    const { nextState } = computeTurnStats({
      snapshot: snapshot({ priorTurnsToday: 2, timezone: 'Europe/Stockholm' }),
      hadZeroErrors: false,
      now: EARLY_UTC,
    });
    assert.equal(nextState.lastGoalMetDate, '2026-08-21');
  });

  it('keeps a late-evening Asunción streak intact across the UTC date line', () => {
    // Late on the 21st in Asunción is already the 22nd in UTC; reading the UTC
    // date would show a 2-day gap and burn the shield for nothing.
    const { result } = computeTurnStats({
      snapshot: snapshot({
        priorTurnsToday: 2,
        timezone: 'America/Asuncion',
        stats: { lastGoalMetDate: '2026-08-20', currentStreak: 3, streakShieldUsedInWeek: '2026-W34' },
      }),
      hadZeroErrors: false,
      now: new Date('2026-08-22T02:00:00.000Z'),
    });
    assert.equal(result.currentStreak, 4, 'still a consecutive local day');
  });
});
