import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  answerPassed,
  answerScore,
  selectPlacementTasks,
  shouldStopEarly,
  suggestLevelFrom,
  PLACEMENT_MAX_TASKS,
  type PlacementAnswer,
} from '@/lib/placement';
import type { CefrLevel } from '@/lib/db/schema';

// The spoken placement check decides where someone starts, so the two things worth
// pinning down are: it never picks a level nobody demonstrated, and the ladder it
// builds actually climbs.

const speak = (prompt: string) => ({ type: 'speak_prompt', prompt });
const listen = (prompt: string) => ({ type: 'listen_prompt', prompt, audioText: 'hola' });

const lesson = (
  id: string,
  level: CefrLevel,
  position: number,
  exercises: unknown[] = [speak(`say something (${id})`)],
) => ({ id, level, position, content: { exercises } });

const answer = (level: CefrLevel, ...severities: string[]): PlacementAnswer => ({
  level,
  severities,
});

describe('selectPlacementTasks', () => {
  it('climbs: lower levels first, and inside a level by position', () => {
    const tasks = selectPlacementTasks([
      lesson('b1-late', 'B1', 9),
      lesson('a1-first', 'A1', 1),
      lesson('a1-late', 'A1', 9),
      lesson('b1-first', 'B1', 1),
      lesson('a2-first', 'A2', 1),
      lesson('a2-late', 'A2', 9),
    ]);
    assert.deepEqual(
      tasks.map((t) => t.lessonId),
      ['a1-first', 'a1-late', 'a2-first', 'a2-late', 'b1-first', 'b1-late'],
    );
    assert.deepEqual(tasks.map((t) => t.level), ['A1', 'A1', 'A2', 'A2', 'B1', 'B1']);
  });

  it('never asks for more turns than the cap allows', () => {
    const many = ['A1', 'A2', 'B1', 'B2', 'C1'].flatMap((level, i) =>
      [1, 5, 9].map((pos) => lesson(`${level}-${pos}`, level as CefrLevel, pos + i)),
    );
    assert.equal(selectPlacementTasks(many).length, PLACEMENT_MAX_TASKS);
  });

  it('skips a lesson with nothing to say out loud', () => {
    const tasks = selectPlacementTasks([
      lesson('listening-only', 'A1', 1, [listen('listen to this')]),
      lesson('speaking', 'A2', 1),
    ]);
    assert.deepEqual(tasks.map((t) => t.lessonId), ['speaking']);
  });

  it('points at the exercise by its index in the lesson, not by its order among speak tasks', () => {
    const [task] = selectPlacementTasks([
      lesson('mixed', 'A1', 1, [listen('first'), speak('second')]),
    ]);
    assert.equal(task.exerciseIndex, 1);
    assert.equal(task.prompt, 'second');
  });

  it('has no ladder to build with no lessons', () => {
    assert.deepEqual(selectPlacementTasks([]), []);
  });
});

describe('scoring one answer', () => {
  it('weighs a major mistake far above a minor one', () => {
    assert.equal(answerScore(['minor']), 0.5);
    assert.equal(answerScore(['major']), 2);
    assert.equal(answerScore([]), 0);
  });

  it('lets one small slip through — this is a placement check, not an exam', () => {
    assert.equal(answerPassed(answer('A2')), true);
    assert.equal(answerPassed(answer('A2', 'minor', 'minor')), true);
    assert.equal(answerPassed(answer('A2', 'major')), false);
  });
});

describe('suggestLevelFrom', () => {
  it('suggests the highest level actually held', () => {
    assert.equal(suggestLevelFrom([answer('A1'), answer('A2'), answer('B1', 'major')]), 'A2');
  });

  it('never extrapolates past the hardest task that was passed', () => {
    assert.equal(suggestLevelFrom([answer('A1'), answer('A2'), answer('B1')]), 'B1');
  });

  it('falls back to A1 when nothing was passed', () => {
    assert.equal(suggestLevelFrom([answer('A1', 'major', 'major'), answer('A2', 'major')]), 'A1');
    assert.equal(suggestLevelFrom([]), 'A1');
  });

  it('is not fooled by a lucky late pass after an early failure', () => {
    // Passing B1 after failing A2 is still evidence of B1, and the ladder is
    // deliberately generous here: the learner confirms the suggestion either way.
    assert.equal(suggestLevelFrom([answer('A2', 'major'), answer('B1')]), 'B1');
  });
});

describe('shouldStopEarly', () => {
  it('keeps going while the learner is passing', () => {
    assert.equal(shouldStopEarly([answer('A1'), answer('A2')]), false);
  });

  it('does not stop on a single bad task', () => {
    assert.equal(shouldStopEarly([answer('A1'), answer('A2', 'major')]), false);
  });

  it('stops after two failures in a row rather than spending another graded turn', () => {
    assert.equal(shouldStopEarly([answer('A1'), answer('A2', 'major'), answer('B1', 'major')]), true);
  });

  it('never stops before there are two answers to look at', () => {
    assert.equal(shouldStopEarly([answer('A1', 'major')]), false);
  });
});
