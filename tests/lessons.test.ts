import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLessonPath, nextLessonInPath, type LessonSummary } from '@/lib/lessons';

// ROADMAP.md P0.1. The path's whole promise is that there is exactly ONE
// highlighted starting point, and that it points at the same lesson on
// /dashboard and /lesson no matter which filter chip is active. These are the
// two ways that promise can break: a pointer that moves when the list is
// narrowed, and a level section whose progress line counts the wrong lessons.

function lesson(id: string, level: LessonSummary['level'], position: number, topic = 'greetings'): LessonSummary {
  return { id, level, topic, title: `Lesson ${id}`, position };
}

const ALL: LessonSummary[] = [
  lesson('a1-1', 'A1', 1),
  lesson('a1-2', 'A1', 2, 'food'),
  lesson('a2-1', 'A2', 1),
  lesson('a2-2', 'A2', 2, 'food'),
];

describe('nextLessonInPath', () => {
  it('points at the first lesson for a brand-new user', () => {
    assert.equal(nextLessonInPath(ALL, new Set())?.id, 'a1-1');
  });

  it('moves past the lessons already completed', () => {
    assert.equal(nextLessonInPath(ALL, new Set(['a1-1', 'a1-2']))?.id, 'a2-1');
  });

  it('skips a completed lesson even when a later one is still open', () => {
    assert.equal(nextLessonInPath(ALL, new Set(['a1-1']))?.id, 'a1-2');
  });

  it('is null once everything is done, so no card is rendered', () => {
    assert.equal(nextLessonInPath(ALL, new Set(ALL.map((l) => l.id))), null);
  });

  it('is null when the pair has no lessons at all', () => {
    assert.equal(nextLessonInPath([], new Set()), null);
  });
});

describe('buildLessonPath', () => {
  it('groups into level sections in input order, keeping lesson order', () => {
    const path = buildLessonPath(ALL, new Set(), 'a1-1');
    assert.deepEqual(
      path.map((g) => g.level),
      ['A1', 'A2'],
    );
    assert.deepEqual(
      path[0].lessons.map((l) => l.id),
      ['a1-1', 'a1-2'],
    );
  });

  it('labels exactly one lesson "next", the rest done or later', () => {
    const path = buildLessonPath(ALL, new Set(['a1-1']), 'a1-2');
    const states = path.flatMap((g) => g.lessons).map((l) => `${l.id}:${l.state}`);
    assert.deepEqual(states, ['a1-1:done', 'a1-2:next', 'a2-1:later', 'a2-2:later']);
  });

  it('counts completions per level for the progress line', () => {
    const path = buildLessonPath(ALL, new Set(['a1-1', 'a1-2', 'a2-1']), null);
    assert.deepEqual(
      path.map((g) => [g.level, g.doneCount, g.total]),
      [
        ['A1', 2, 2],
        ['A2', 1, 2],
      ],
    );
  });

  it('keeps the pointer on the same lesson when a filter narrows the list', () => {
    const completed = new Set<string>();
    const nextUp = nextLessonInPath(ALL, completed);
    const filtered = ALL.filter((l) => l.topic === 'food');
    const path = buildLessonPath(filtered, completed, nextUp?.id ?? null);
    // 'a1-1' is filtered out, so nothing in view is "next" - and crucially the
    // pointer did NOT slide onto the first visible lesson instead.
    assert.deepEqual(
      path.flatMap((g) => g.lessons).map((l) => l.state),
      ['later', 'later'],
    );
  });
});
