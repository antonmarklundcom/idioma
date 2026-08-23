import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assembleProblemDrill, PROBLEM_DRILL_MAX_CARDS } from '@/lib/problemAreas';

// The drill is a SELECTION over stored rows - PLAN.md §0 forbids writing lesson
// content at request time. What these cover is the selection's promises: the worst
// mistakes lead, a mistake with no material is reported as a gap rather than silently
// dropped, and the round stays a round.

const NOW = new Date('2026-08-23T12:00:00Z');
const due = new Date('2026-08-20T12:00:00Z');
const notDue = new Date('2026-08-30T12:00:00Z');

const pattern = (id: string, occurrenceCount: number) => ({
  id,
  patternKey: `key-${id}`,
  description: `mistake ${id}`,
  occurrenceCount,
});

const patternItem = (id: string, sourceRef: string, dueAt: Date) => ({
  id,
  kind: 'error_pattern' as const,
  front: `front ${id}`,
  back: `back ${id}`,
  sourceRef,
  dueAt,
});

const vocab = (id: string) => ({
  id,
  kind: 'vocab' as const,
  front: `vocab front ${id}`,
  back: `vocab back ${id}`,
});

describe('assembleProblemDrill', () => {
  it('flags a pattern with stored material and one without', () => {
    const drill = assembleProblemDrill({
      patterns: [pattern('a', 9), pattern('b', 4)],
      patternItems: [patternItem('item-a', 'a', due)],
      dueVocab: [],
      now: NOW,
    });
    assert.deepEqual(
      drill.patterns.map((p) => [p.id, p.hasMaterial]),
      [
        ['a', true],
        ['b', false],
      ],
    );
    assert.deepEqual(drill.gaps, ['key-b'], 'the mistake nothing practises is the content gap');
  });

  it('leads with mistakes the SRS has already surfaced', () => {
    const drill = assembleProblemDrill({
      patterns: [pattern('a', 9), pattern('b', 8)],
      patternItems: [patternItem('later', 'a', notDue), patternItem('overdue', 'b', due)],
      dueVocab: [],
      now: NOW,
    });
    assert.deepEqual(drill.cards.map((c) => c.id), ['overdue', 'later']);
  });

  it('fills a short drill out with due vocab, mistakes first', () => {
    const drill = assembleProblemDrill({
      patterns: [pattern('a', 9)],
      patternItems: [patternItem('mistake', 'a', due)],
      dueVocab: [vocab('v1'), vocab('v2')],
      now: NOW,
    });
    assert.deepEqual(drill.cards.map((c) => c.id), ['mistake', 'v1', 'v2']);
  });

  it('keeps a round a round', () => {
    const drill = assembleProblemDrill({
      patterns: [pattern('a', 9)],
      patternItems: [patternItem('mistake', 'a', due)],
      dueVocab: Array.from({ length: 40 }, (_, i) => vocab(`v${i}`)),
      now: NOW,
    });
    assert.equal(drill.cards.length, PROBLEM_DRILL_MAX_CARDS);
  });

  it('never repeats a card that is both a mistake item and due vocab', () => {
    const drill = assembleProblemDrill({
      patterns: [pattern('a', 9)],
      patternItems: [patternItem('same', 'a', due)],
      dueVocab: [{ ...vocab('same'), kind: 'vocab' as const }],
      now: NOW,
    });
    assert.deepEqual(drill.cards.map((c) => c.id), ['same']);
  });

  it('reports every gap when nothing at all is stored', () => {
    const drill = assembleProblemDrill({
      patterns: [pattern('a', 9), pattern('b', 4)],
      patternItems: [],
      dueVocab: [],
      now: NOW,
    });
    assert.deepEqual(drill.cards, []);
    assert.deepEqual(drill.gaps, ['key-a', 'key-b']);
  });
});
