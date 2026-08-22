import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TODAY_REVIEW_CAP, buildTodaySteps, estimateTodayMinutes } from '@/lib/today';

// ROADMAP.md P0.4. The session makes two promises to the learner: it always has
// something for them to do, and it is as short as the button says. These test
// both - an empty step would strand a new user, and an estimate that ignores the
// lesson would advertise a two-minute session that takes ten.

describe('buildTodaySteps', () => {
  it('runs the full chain when there are reviews and a lesson', () => {
    assert.deepEqual(buildTodaySteps({ dueCount: 3, exerciseCount: 4 }), [
      'review',
      'lesson',
      'speak',
    ]);
  });

  it('drops the review step when nothing is due', () => {
    assert.deepEqual(buildTodaySteps({ dueCount: 0, exerciseCount: 4 }), ['lesson', 'speak']);
  });

  it('drops the lesson step when the next lesson has no playable exercise', () => {
    assert.deepEqual(buildTodaySteps({ dueCount: 2, exerciseCount: 0 }), ['review', 'speak']);
  });

  it('always leaves the speaking turn, so a session is never empty', () => {
    assert.deepEqual(buildTodaySteps({ dueCount: 0, exerciseCount: 0 }), ['speak']);
  });
});

describe('estimateTodayMinutes', () => {
  it('is never zero, even for the shortest possible session', () => {
    assert.ok(estimateTodayMinutes({ dueCount: 0, exerciseCount: 0 }) >= 1);
  });

  it('grows with both the review queue and the lesson', () => {
    const bare = estimateTodayMinutes({ dueCount: 0, exerciseCount: 0 });
    const withReviews = estimateTodayMinutes({ dueCount: TODAY_REVIEW_CAP, exerciseCount: 0 });
    const withBoth = estimateTodayMinutes({ dueCount: TODAY_REVIEW_CAP, exerciseCount: 5 });
    assert.ok(withReviews > bare, 'reviews should add time');
    assert.ok(withBoth > withReviews, 'lesson exercises should add time');
  });

  it('keeps a full session inside the ~10 minutes the roadmap promises', () => {
    assert.ok(estimateTodayMinutes({ dueCount: TODAY_REVIEW_CAP, exerciseCount: 6 }) <= 10);
  });
});
