import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  TODAY_REVIEW_CAP,
  buildTodaySteps,
  estimateTodayMinutes,
  todaySessionShape,
} from '@/lib/today';

// ROADMAP.md P0.4. The session makes two promises to the learner: it always has
// something for them to do, and it is as short as the button says. These test
// both - an empty step would strand a new user, and an estimate that ignores the
// lesson would advertise a two-minute session that takes ten.

/** The heaviest real lesson in content/lessons: 11 vocab, 6 dialogue lines, 6 exercises. */
const HEAVY_LESSON = {
  vocab: Array.from({ length: 11 }, (_, i) => ({ term: `t${i}`, gloss: `g${i}` })),
  dialogue: {
    setup: 'At the corner shop',
    learnerSpeaker: 'You',
    lines: [
      { speaker: 'Shopkeeper', text: '¿Qué te doy?' },
      { speaker: 'You', text: 'Dame dos empanadas.' },
      { speaker: 'Shopkeeper', text: 'Son diez mil.' },
      { speaker: 'You', text: 'Acá tenés.' },
      { speaker: 'Shopkeeper', text: 'Gracias.' },
      { speaker: 'You', text: 'Nada más.' },
    ],
  },
  exercises: Array.from({ length: 6 }, (_, i) => ({
    type: 'speak_prompt',
    prompt: `p${i}`,
    targetHints: [],
  })),
};

const shape = (over: Partial<ReturnType<typeof todaySessionShape>> = {}) => ({
  dueCount: 0,
  vocabCount: 0,
  dialogueLineCount: 0,
  exerciseCount: 0,
  ...over,
});

describe('todaySessionShape', () => {
  it('reads the words, the conversation and the drills off one lesson', () => {
    const s = todaySessionShape(3, HEAVY_LESSON);
    assert.equal(s.dueCount, 3);
    assert.equal(s.vocabCount, 11);
    assert.equal(s.dialogueLineCount, 6);
    assert.equal(s.exerciseCount, 6);
  });

  /**
   * The whole reason /today can afford the conversation. Every learner line in a
   * dialogue is a graded turn when the lesson tab performs it; here the exchange is
   * played as the model only. If these ever leaked into `exerciseCount`, the session
   * would quietly grow six graded turns and the button's estimate would be a lie.
   */
  it('does not count the dialogue as exercises', () => {
    assert.equal(todaySessionShape(0, HEAVY_LESSON).exerciseCount, 6);
  });

  it('handles a path with nothing left to serve', () => {
    assert.deepEqual(todaySessionShape(4, null), {
      dueCount: 4,
      vocabCount: 0,
      dialogueLineCount: 0,
      exerciseCount: 0,
    });
  });

  it('handles a lesson with no vocab and no dialogue', () => {
    const s = todaySessionShape(0, { exercises: HEAVY_LESSON.exercises });
    assert.equal(s.vocabCount, 0);
    assert.equal(s.dialogueLineCount, 0);
    assert.equal(s.exerciseCount, 6);
  });
});

describe('buildTodaySteps', () => {
  it('runs the full chain when there are reviews and a lesson', () => {
    assert.deepEqual(buildTodaySteps(shape({ dueCount: 3, exerciseCount: 4 })), [
      'review',
      'lesson',
      'speak',
    ]);
  });

  it('drops the review step when nothing is due', () => {
    assert.deepEqual(buildTodaySteps(shape({ exerciseCount: 4 })), ['lesson', 'speak']);
  });

  it('drops the lesson step when the next lesson has no playable exercise', () => {
    assert.deepEqual(buildTodaySteps(shape({ dueCount: 2 })), ['review', 'speak']);
  });

  it('always leaves the speaking turn, so a session is never empty', () => {
    assert.deepEqual(buildTodaySteps(shape()), ['speak']);
  });
});

describe('estimateTodayMinutes', () => {
  it('is never zero, even for the shortest possible session', () => {
    assert.ok(estimateTodayMinutes(shape()) >= 1);
  });

  it('grows with the review queue, the lesson, the words and the conversation', () => {
    const bare = estimateTodayMinutes(shape());
    const withReviews = estimateTodayMinutes(shape({ dueCount: TODAY_REVIEW_CAP }));
    const withDrills = estimateTodayMinutes(shape({ dueCount: TODAY_REVIEW_CAP, exerciseCount: 5 }));
    const withVocab = estimateTodayMinutes(
      shape({ dueCount: TODAY_REVIEW_CAP, exerciseCount: 5, vocabCount: 10 }),
    );
    const withDialogue = estimateTodayMinutes(
      shape({ dueCount: TODAY_REVIEW_CAP, exerciseCount: 5, vocabCount: 10, dialogueLineCount: 6 }),
    );
    assert.ok(withReviews > bare, 'reviews should add time');
    assert.ok(withDrills > withReviews, 'lesson exercises should add time');
    // Non-decreasing per step, because the estimate is rounded to whole minutes and
    // a six-line dialogue is thirty-six seconds - real time that can land inside the
    // same minute. What must never happen is a step making the session look shorter.
    assert.ok(withVocab >= withDrills, 'the vocab step should not shorten the session');
    assert.ok(withDialogue >= withVocab, 'the dialogue step should not shorten the session');
    // Together they are worth more than a minute, so the button has to say so.
    assert.ok(withDialogue > withDrills, 'words plus conversation should add a minute');
  });

  /**
   * The player only shows the words and the conversation when it has exercises to
   * introduce, so a session with no lesson step must not advertise time for steps
   * that will never run.
   */
  it('charges nothing for words and dialogue when there is no lesson step', () => {
    assert.equal(
      estimateTodayMinutes(shape({ dueCount: 3, vocabCount: 12, dialogueLineCount: 6 })),
      estimateTodayMinutes(shape({ dueCount: 3 })),
    );
  });

  it('keeps the heaviest lesson-shaped session inside the ~10 minutes promised', () => {
    const worst = todaySessionShape(TODAY_REVIEW_CAP, HEAVY_LESSON);
    assert.ok(
      estimateTodayMinutes(worst) <= 10,
      `heaviest session estimated at ${estimateTodayMinutes(worst)} minutes`,
    );
  });

  /**
   * Against the real curriculum, not a fixture. /today now presents the words and
   * plays the conversation, so the session's length depends on content the owner
   * imports - and a pack with a 16-word vocab list would push it past the promise
   * silently, on somebody's phone, weeks later. This is the check that says so at
   * build time instead. If it fails, either the pack is too heavy for a daily
   * session or the per-item seconds in lib/today.ts are wrong.
   */
  it('keeps every lesson in content/lessons inside that promise too', () => {
    const dir = join(process.cwd(), 'content', 'lessons');
    const lessons = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { title: string; content: unknown }[]);

    assert.ok(lessons.length > 0, 'no lessons found to check');

    const over = lessons
      .map((lesson) => ({
        title: lesson.title,
        minutes: estimateTodayMinutes(todaySessionShape(TODAY_REVIEW_CAP, lesson.content)),
      }))
      .filter((l) => l.minutes > 10);

    assert.deepEqual(over, [], `these lessons make today's session too long: ${JSON.stringify(over)}`);
  });
});
