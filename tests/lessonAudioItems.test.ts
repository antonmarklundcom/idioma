import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lessonAudioItems } from '@/lib/lessons';

// This list is what the generator walks and what the audio route serves. If the two
// ever disagree, a learner taps a word that was never generated and pays for it - so
// what belongs in the list, and what its indexes mean, is worth pinning down.

const content = {
  vocab: [
    { term: 'la cabaña', gloss: 'stugan' },
    { term: 'el invierno', gloss: 'vintern' },
  ],
  dialogue: {
    setup: 'Vid bordet.',
    learnerSpeaker: 'Du',
    lines: [
      { speaker: 'Vecino', text: '¿Cómo andás?', gloss: 'Hur mår du?' },
      { speaker: 'Du', text: 'Todo bien.', gloss: 'Svara att allt är bra.' },
    ],
  },
  exercises: [
    { type: 'speak_prompt', prompt: 'Säg hej.' },
    { type: 'listen_prompt', audioText: 'Escuchá bien esto.', prompt: 'Vad sa hon?' },
  ],
};

describe('lessonAudioItems', () => {
  it('collects every recordable piece of a lesson', () => {
    const items = lessonAudioItems(content);
    assert.deepEqual(
      items.map((i) => `${i.slot}[${i.index}] ${i.text}`),
      [
        'vocab[0] la cabaña',
        'vocab[1] el invierno',
        'dialogue[0] ¿Cómo andás?',
        'dialogue[1] Todo bien.',
        'exercise[1] Escuchá bien esto.',
        // The 'prompt' slot: the exercise's own instruction, in the learner's OWN
        // language - narrated in the pair's nativeVoice, not its ttsVoice (see the
        // audio route and scripts/generate-audio.ts).
        'prompt[0] Säg hej.',
        'prompt[1] Vad sa hon?',
      ],
    );
  });

  it('indexes a listening prompt by its position among ALL exercises', () => {
    // The route is asked for `?exercise=1`, which indexes content.exercises - not the
    // exercises that happen to have audio. Off by one here and every listening clip
    // in the app plays the wrong lesson's line.
    const listen = lessonAudioItems(content).find((i) => i.slot === 'exercise');
    assert.equal(listen?.index, 1);
  });

  it('leaves out what has no recording: glosses and gapped sentences', () => {
    const items = lessonAudioItems(content);
    assert.ok(!items.some((i) => i.text === 'stugan'), 'a gloss is the learner’s own language');
  });

  it('returns nothing rather than throwing on a malformed lesson', () => {
    assert.deepEqual(lessonAudioItems(null), []);
    assert.deepEqual(lessonAudioItems({}), []);
    assert.deepEqual(lessonAudioItems({ vocab: 'not an array', exercises: 7 }), []);
  });

  it('skips a dialogue line with no text instead of generating silence', () => {
    const items = lessonAudioItems({
      vocab: [],
      dialogue: { learnerSpeaker: 'Du', lines: [{ speaker: 'Du', text: '' }] },
      exercises: [{ type: 'speak_prompt', prompt: 'x' }],
    });
    // The malformed dialogue line contributes nothing, but the exercise's own prompt
    // still does - it does not depend on the dialogue block at all.
    assert.deepEqual(items, [{ slot: 'prompt', index: 0, text: 'x' }]);
  });
});
