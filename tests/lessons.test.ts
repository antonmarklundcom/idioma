import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDialoguePromptContext,
  buildExercisePromptContext,
  buildLessonPath,
  deriveLessonMastery,
  formatTopic,
  getDialogueAudioText,
  getVocabAudioText,
  splitIntro,
  toDialogueTurns,
  toPlayerDialogue,
  nextLessonAfter,
  nextLessonInPath,
  shakiestLesson,
  toPlayerExercises,
  type LessonSessionSummary,
  type LessonSummary,
} from '@/lib/lessons';

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

// The topic slug is a URL filter key AND a label on screen. It was shipping raw,
// so /lesson showed the learner 42 hyphenated database identifiers.
describe('formatTopic', () => {
  it('turns a slug into something a person would read', () => {
    assert.equal(formatTopic('asking-directions'), 'Asking directions');
    assert.equal(formatTopic('banking-and-bills'), 'Banking and bills');
    assert.equal(formatTopic('numbers-prices-money'), 'Numbers prices money');
  });

  it('leaves an already-readable topic alone apart from its capital', () => {
    assert.equal(formatTopic('clarification'), 'Clarification');
  });

  it('handles underscores and stray whitespace without producing junk', () => {
    assert.equal(formatTopic('basic_health'), 'Basic health');
    assert.equal(formatTopic('  small-talk-basics '), 'Small talk basics');
  });

  it('returns an empty-ish topic unchanged rather than crashing the page', () => {
    assert.equal(formatTopic(''), '');
  });
});


// ---------------------------------------------------------------------------
// ROADMAP.md P1.5 - the vocab step and the fill_gap_speak exercise type
//
// Both share one rule with listen_prompt: what the learner is supposed to PRODUCE
// never travels to the browser. A regression there is silent (the lesson still
// works, it just stops teaching), so it is asserted rather than assumed.
// ---------------------------------------------------------------------------

const FILL_GAP_LESSON = {
  intro: 'x',
  vocab: [
    { term: "I'm from Paraguay.", gloss: 'Soy de Paraguay.' },
    { term: 'Nice to meet you.', gloss: 'Mucho gusto.' },
  ],
  exercises: [
    { type: 'speak_prompt', prompt: 'Say hello.' },
    {
      type: 'fill_gap_speak',
      prompt: 'Say the whole sentence.',
      sentence: 'I ___ from Paraguay.',
      answer: "I'm from Paraguay.",
      targetHints: ['be, not have'],
    },
  ],
};

describe('fill_gap_speak', () => {
  it('reaches the player with its gapped sentence but without the answer', () => {
    const exercises = toPlayerExercises(FILL_GAP_LESSON);
    const gap = exercises[1];
    assert.equal(gap.kind, 'fill_gap');
    assert.equal(gap.sentence, 'I ___ from Paraguay.');
    assert.ok(!JSON.stringify(exercises).includes("I'm from Paraguay."), 'the answer leaked');
  });

  it('is skipped, not crashed on, when the sentence is missing', () => {
    const broken = { ...FILL_GAP_LESSON, exercises: [{ type: 'fill_gap_speak', prompt: 'x' }] };
    assert.deepEqual(toPlayerExercises(broken), []);
  });

  it('gives the grader the sentence, the answer and the hints', () => {
    const context = buildExercisePromptContext(FILL_GAP_LESSON, 1) ?? '';
    assert.match(context, /I ___ from Paraguay\./);
    assert.match(context, /I'm from Paraguay\./);
    assert.match(context, /be, not have/);
  });

  it('still grades when the lesson gives no answer to compare against', () => {
    const lesson = {
      ...FILL_GAP_LESSON,
      exercises: [{ type: 'fill_gap_speak', prompt: 'Say it.', sentence: 'I ___ tired.' }],
    };
    const context = buildExercisePromptContext(lesson, 0) ?? '';
    assert.match(context, /I ___ tired\./);
    assert.ok(!context.includes('completed reads'));
  });
});

describe('getVocabAudioText', () => {
  it('synthesizes the target-language term, not the learner-language gloss', () => {
    assert.equal(getVocabAudioText(FILL_GAP_LESSON, 0), "I'm from Paraguay.");
  });

  it('returns null for an index the lesson does not have, so the route 404s', () => {
    assert.equal(getVocabAudioText(FILL_GAP_LESSON, 9), null);
    assert.equal(getVocabAudioText({ intro: 'x', exercises: [] }, 0), null);
  });
});

// ---------------------------------------------------------------------------
// ROADMAP.md P1.6 - mastery states
// ---------------------------------------------------------------------------

function run(
  lessonId: string,
  endedAt: string | null,
  utteranceCount: number,
  minorErrors: number,
  seriousErrors = 0,
): LessonSessionSummary {
  return {
    lessonId,
    endedAt: endedAt ? new Date(endedAt) : null,
    utteranceCount,
    minorErrors,
    seriousErrors,
  };
}

describe('deriveLessonMastery', () => {
  it('calls an unfinished session "started", not completed', () => {
    const mastery = deriveLessonMastery([run('a1-1', null, 2, 0)]);
    assert.equal(mastery.get('a1-1')?.state, 'started');
  });

  it('masters a clean finished run', () => {
    const mastery = deriveLessonMastery([run('a1-1', '2026-08-01T10:00:00Z', 4, 3)]);
    assert.equal(mastery.get('a1-1')?.state, 'mastered');
  });

  it('withholds mastery for a single major error, however few mistakes overall', () => {
    const mastery = deriveLessonMastery([run('a1-1', '2026-08-01T10:00:00Z', 5, 0, 1)]);
    assert.equal(mastery.get('a1-1')?.state, 'completed');
  });

  it('withholds mastery when the minor errors outnumber the turns', () => {
    const mastery = deriveLessonMastery([run('a1-1', '2026-08-01T10:00:00Z', 3, 4)]);
    assert.equal(mastery.get('a1-1')?.state, 'completed');
  });

  it('judges the LAST finished run, not the best one', () => {
    const mastery = deriveLessonMastery([
      run('a1-1', '2026-08-01T10:00:00Z', 4, 0), // a clean run, long ago
      run('a1-1', '2026-08-09T10:00:00Z', 4, 6), // and a bad one since
    ]);
    assert.equal(mastery.get('a1-1')?.state, 'completed');
  });

  it('ignores an open session that came after a finished one', () => {
    const mastery = deriveLessonMastery([
      run('a1-1', '2026-08-01T10:00:00Z', 4, 0),
      run('a1-1', null, 1, 5),
    ]);
    assert.equal(mastery.get('a1-1')?.state, 'mastered');
  });

  it('cannot master a lesson finished without speaking at all', () => {
    const mastery = deriveLessonMastery([run('a1-1', '2026-08-01T10:00:00Z', 0, 0)]);
    assert.equal(mastery.get('a1-1')?.state, 'completed');
  });

  it('says nothing about a lesson never opened', () => {
    assert.equal(deriveLessonMastery([]).get('a1-1'), undefined);
  });
});

describe('shakiestLesson', () => {
  it('picks the completed lesson whose last run went worst', () => {
    const mastery = deriveLessonMastery([
      run('a1-1', '2026-08-01T10:00:00Z', 4, 5), // shaky
      run('a1-2', '2026-08-02T10:00:00Z', 4, 12), // shakier
      run('a2-1', '2026-08-03T10:00:00Z', 4, 0), // mastered
    ]);
    assert.equal(shakiestLesson(ALL, mastery)?.id, 'a1-2');
  });

  it('is null when everything completed is already mastered', () => {
    const mastery = deriveLessonMastery([run('a1-1', '2026-08-01T10:00:00Z', 4, 1)]);
    assert.equal(shakiestLesson(ALL, mastery), null);
  });

  it('ignores lessons that were only started', () => {
    const mastery = deriveLessonMastery([run('a1-1', null, 3, 9)]);
    assert.equal(shakiestLesson(ALL, mastery), null);
  });

  it('breaks a tie towards the earlier lesson, where the foundation is', () => {
    const mastery = deriveLessonMastery([
      run('a1-1', '2026-08-01T10:00:00Z', 4, 5),
      run('a2-1', '2026-08-02T10:00:00Z', 4, 5),
    ]);
    assert.equal(shakiestLesson(ALL, mastery)?.id, 'a1-1');
  });
});

describe('buildLessonPath with mastery', () => {
  it('carries each lesson\'s mastery state onto its row', () => {
    const mastery = deriveLessonMastery([
      run('a1-1', '2026-08-01T10:00:00Z', 4, 0),
      run('a1-2', '2026-08-02T10:00:00Z', 4, 9),
      run('a2-1', null, 1, 0),
    ]);
    const completed = new Set(['a1-1', 'a1-2']);
    const path = buildLessonPath(ALL, completed, 'a2-1', mastery);
    assert.deepEqual(
      path.flatMap((g) => g.lessons).map((l) => `${l.id}:${l.mastery}`),
      ['a1-1:mastered', 'a1-2:completed', 'a2-1:started', 'a2-2:untouched'],
    );
  });

  it('falls back to the completed set when no mastery map is passed', () => {
    const path = buildLessonPath(ALL, new Set(['a1-1']), 'a1-2');
    assert.deepEqual(
      path.flatMap((g) => g.lessons).map((l) => l.mastery),
      ['completed', 'untouched', 'untouched', 'untouched'],
    );
  });
});


describe('nextLessonAfter', () => {
  it('offers the following lesson in path order', () => {
    assert.equal(nextLessonAfter(ALL, 'a1-2')?.id, 'a2-1');
  });

  it('offers nothing at the end of the curriculum', () => {
    assert.equal(nextLessonAfter(ALL, 'a2-2'), null);
  });

  it('offers nothing for a lesson that is not in the list', () => {
    assert.equal(nextLessonAfter(ALL, 'not-a-lesson'), null);
  });

  it('ignores completion - the next lesson is the next one, done or not', () => {
    assert.equal(nextLessonAfter(ALL, 'a1-1')?.id, 'a1-2');
  });
});


// ---------------------------------------------------------------------------
// The dialogue block (ROADMAP.md lesson-loop item 4)
// ---------------------------------------------------------------------------

const DIALOGUE_LESSON = {
  intro: 'Ordering at a corner shop. In Paraguay the shopkeeper opens, not you.',
  canDo: 'After this you can buy something at a despensa and ask what it costs.',
  dialogue: {
    setup: 'En la despensa de la esquina',
    learnerSpeaker: 'Vos',
    lines: [
      { speaker: 'Vendedora', text: '¿Qué te doy?', gloss: 'What can I get you?' },
      { speaker: 'Vos', text: 'Dame dos empanadas, por favor.', gloss: 'Give me two empanadas.' },
      { speaker: 'Vendedora', text: 'Son diez mil.', gloss: "That's ten thousand." },
      { speaker: 'Vos', text: 'Acá tenés. Gracias.', gloss: 'Here you go. Thanks.' },
    ],
  },
  exercises: [{ type: 'speak_prompt', prompt: 'Order something else.' }],
};

describe('toPlayerDialogue', () => {
  it('marks the learner\'s own lines and keeps the exchange in order', () => {
    const dialogue = toPlayerDialogue(DIALOGUE_LESSON);
    assert.deepEqual(
      dialogue?.lines.map((l) => `${l.index}:${l.isLearner}`),
      ['0:false', '1:true', '2:false', '3:true'],
    );
    assert.equal(dialogue?.setup, 'En la despensa de la esquina');
  });

  it('is null for a lesson with no dialogue, so nothing renders', () => {
    assert.equal(toPlayerDialogue({ intro: 'x', exercises: [] }), null);
  });

  it('refuses a dialogue nobody performs, and one nobody answers', () => {
    const noLearner = {
      ...DIALOGUE_LESSON,
      dialogue: { ...DIALOGUE_LESSON.dialogue, learnerSpeaker: 'Nadie' },
    };
    assert.equal(toPlayerDialogue(noLearner), null);

    const allLearner = {
      ...DIALOGUE_LESSON,
      dialogue: {
        learnerSpeaker: 'Vos',
        lines: [
          { speaker: 'Vos', text: 'Hola' },
          { speaker: 'Vos', text: 'Chau' },
        ],
      },
    };
    assert.equal(toPlayerDialogue(allLearner), null);
  });

  it('refuses a malformed line rather than rendering half an exchange', () => {
    const broken = {
      ...DIALOGUE_LESSON,
      dialogue: {
        learnerSpeaker: 'Vos',
        lines: [{ speaker: 'Vendedora', text: '¿Qué te doy?' }, { speaker: 'Vos' }],
      },
    };
    assert.equal(toPlayerDialogue(broken), null);
  });
});

describe('toDialogueTurns', () => {
  it('turns each learner line into a step cued by its meaning', () => {
    const turns = toDialogueTurns(DIALOGUE_LESSON);
    assert.deepEqual(
      turns.map((t) => [t.index, t.kind, t.prompt]),
      [
        [1, 'dialogue', 'Give me two empanadas.'],
        [3, 'dialogue', 'Here you go. Thanks.'],
      ],
    );
  });

  it('carries what the other person just said, for context on screen', () => {
    assert.equal(toDialogueTurns(DIALOGUE_LESSON)[0].contextLine, '¿Qué te doy?');
  });

  it('is empty for a lesson without a dialogue', () => {
    assert.deepEqual(toDialogueTurns({ intro: 'x', exercises: [] }), []);
  });
});

describe('buildDialoguePromptContext', () => {
  it('grades the line inside its exchange, not as a stray sentence', () => {
    const context = buildDialoguePromptContext(DIALOGUE_LESSON, 1) ?? '';
    assert.match(context, /¿Qué te doy\?/);
    assert.match(context, /Dame dos empanadas, por favor\./);
    assert.match(context, /En la despensa de la esquina/);
  });

  it('refuses a line the learner does not perform', () => {
    assert.equal(buildDialoguePromptContext(DIALOGUE_LESSON, 0), null);
    assert.equal(buildDialoguePromptContext(DIALOGUE_LESSON, 9), null);
  });
});

describe('getDialogueAudioText', () => {
  it('synthesizes the line as written, including the other side', () => {
    assert.equal(getDialogueAudioText(DIALOGUE_LESSON, 0), '¿Qué te doy?');
    assert.equal(getDialogueAudioText(DIALOGUE_LESSON, 3), 'Acá tenés. Gracias.');
  });

  it('returns null for a lesson with no dialogue', () => {
    assert.equal(getDialogueAudioText({ intro: 'x', exercises: [] }, 0), null);
  });
});

// ROADMAP.md lesson-loop item 5: the promise first, the fine print behind a toggle.
describe('splitIntro', () => {
  it('prefers an explicit canDo, keeping the whole intro as the detail', () => {
    const { lead, rest } = splitIntro('Long explanation. With a trap.', 'You can order food.');
    assert.equal(lead, 'You can order food.');
    assert.equal(rest, 'Long explanation. With a trap.');
  });

  it('falls back to the first sentence, so old lessons need no rewrite', () => {
    const { lead, rest } = splitIntro(
      'Vas a poder presentarte en inglés. Fijate en la trampa clásica: la edad va con "be".',
    );
    assert.equal(lead, 'Vas a poder presentarte en inglés.');
    assert.equal(rest, 'Fijate en la trampa clásica: la edad va con "be".');
  });

  it('leaves a one-sentence intro with nothing hidden behind the toggle', () => {
    assert.deepEqual(splitIntro('Just the one sentence.'), {
      lead: 'Just the one sentence.',
      rest: null,
    });
  });

  it('handles ? and ! endings and an empty intro', () => {
    assert.equal(splitIntro('¿Cómo andás? Eso vas a aprender.').lead, '¿Cómo andás?');
    assert.deepEqual(splitIntro(''), { lead: '', rest: null });
  });
});
