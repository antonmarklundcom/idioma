import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUDIO_BASE64_MAX_CHARS,
  PROMPT_CONTEXT_MAX_CHARS,
  TEXT_ANSWER_MAX_CHARS,
  lessonAttemptRequestSchema,
  lessonImportItemSchema,
  reviewGradeRequestSchema,
  sessionEndRequestSchema,
} from '@/lib/zodSchemas';

// PLAN.md §6.3/§10.6: the request schemas are the trust boundary. Everything past them
// is spent model quota, so the bounds are cost controls, not tidiness — a modified
// client feeding megabytes into TWO model calls per turn is the case they stop.

const UUID = '3f6b0f1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('lessonAttemptRequestSchema — exactly one input', () => {
  it('accepts text alone', () => {
    const parsed = lessonAttemptRequestSchema.parse({ text: 'Quiero un café.' });
    assert.deepEqual(parsed.input, { kind: 'text', text: 'Quiero un café.' });
    assert.equal(parsed.mode, 'lesson', 'mode defaults so the route never branches on undefined');
  });

  it('accepts audio with its real MIME type (§10.1: iOS sends audio/mp4)', () => {
    const parsed = lessonAttemptRequestSchema.parse({
      audioBase64: 'AAAA',
      mimeType: 'audio/mp4',
    });
    assert.deepEqual(parsed.input, { kind: 'audio', base64: 'AAAA', mimeType: 'audio/mp4' });
  });

  it('rejects both inputs at once, and neither', () => {
    assert.equal(
      lessonAttemptRequestSchema.safeParse({ text: 'hi', audioBase64: 'AAAA', mimeType: 'audio/webm' })
        .success,
      false,
    );
    assert.equal(lessonAttemptRequestSchema.safeParse({}).success, false);
  });

  it('rejects audio without a MIME type — a hardcoded default is the §10.1 bug', () => {
    assert.equal(lessonAttemptRequestSchema.safeParse({ audioBase64: 'AAAA' }).success, false);
  });

  it('rejects a non-audio MIME type', () => {
    assert.equal(
      lessonAttemptRequestSchema.safeParse({ audioBase64: 'AAAA', mimeType: 'video/mp4' }).success,
      false,
    );
  });

  it('trims text and rejects a whitespace-only answer', () => {
    assert.equal(lessonAttemptRequestSchema.parse({ text: '  hola  ' }).input.kind, 'text');
    assert.equal(lessonAttemptRequestSchema.safeParse({ text: '   ' }).success, false);
  });
});

describe('lessonAttemptRequestSchema — bounds', () => {
  it('bounds the audio payload at the §6.3 limit', () => {
    const ok = { audioBase64: 'a'.repeat(AUDIO_BASE64_MAX_CHARS), mimeType: 'audio/webm' };
    assert.equal(lessonAttemptRequestSchema.safeParse(ok).success, true);

    const tooBig = { audioBase64: 'a'.repeat(AUDIO_BASE64_MAX_CHARS + 1), mimeType: 'audio/webm' };
    assert.equal(lessonAttemptRequestSchema.safeParse(tooBig).success, false);
  });

  it('bounds a typed answer to one utterance, not an essay', () => {
    assert.equal(
      lessonAttemptRequestSchema.safeParse({ text: 'a'.repeat(TEXT_ANSWER_MAX_CHARS) }).success,
      true,
    );
    assert.equal(
      lessonAttemptRequestSchema.safeParse({ text: 'a'.repeat(TEXT_ANSWER_MAX_CHARS + 1) }).success,
      false,
    );
  });

  it('bounds client-supplied promptContext — it is substituted into the system prompt', () => {
    const build = (len: number) => ({ text: 'hola', promptContext: 'a'.repeat(len) });
    assert.equal(lessonAttemptRequestSchema.safeParse(build(PROMPT_CONTEXT_MAX_CHARS)).success, true);
    assert.equal(lessonAttemptRequestSchema.safeParse(build(PROMPT_CONTEXT_MAX_CHARS + 1)).success, false);
  });
});

describe('lessonAttemptRequestSchema — lesson and mode fields', () => {
  it('requires a lessonId alongside an exerciseIndex', () => {
    assert.equal(lessonAttemptRequestSchema.safeParse({ text: 'hola', exerciseIndex: 0 }).success, false);
    assert.equal(
      lessonAttemptRequestSchema.safeParse({ text: 'hola', exerciseIndex: 0, lessonId: UUID }).success,
      true,
    );
  });

  it('rejects a negative or fractional exercise index', () => {
    for (const exerciseIndex of [-1, 1.5]) {
      assert.equal(
        lessonAttemptRequestSchema.safeParse({ text: 'hola', lessonId: UUID, exerciseIndex }).success,
        false,
      );
    }
  });

  it('rejects ids that are not uuids', () => {
    assert.equal(lessonAttemptRequestSchema.safeParse({ text: 'hola', lessonId: 'l1' }).success, false);
    assert.equal(
      lessonAttemptRequestSchema.safeParse({ text: 'hola', reviewItemId: 'r1' }).success,
      false,
    );
  });

  it('accepts only the three real modes', () => {
    for (const mode of ['lesson', 'live', 'review']) {
      assert.equal(lessonAttemptRequestSchema.safeParse({ text: 'hola', mode }).success, true, mode);
    }
    assert.equal(lessonAttemptRequestSchema.safeParse({ text: 'hola', mode: 'premium' }).success, false);
  });
});

describe('reviewGradeRequestSchema', () => {
  it('accepts the three §13.3 grades and nothing else', () => {
    for (const outcome of ['again', 'good', 'easy']) {
      assert.equal(reviewGradeRequestSchema.safeParse({ itemId: UUID, outcome }).success, true, outcome);
    }
    assert.equal(reviewGradeRequestSchema.safeParse({ itemId: UUID, outcome: 'hard' }).success, false);
  });

  it('requires the item id', () => {
    assert.equal(reviewGradeRequestSchema.safeParse({ outcome: 'good' }).success, false);
  });
});

describe('sessionEndRequestSchema (§16 defect 1)', () => {
  it('carries no session id — the server re-resolves the caller’s own open session', () => {
    const parsed = sessionEndRequestSchema.parse({ mode: 'review' });
    assert.deepEqual(Object.keys(parsed).sort(), ['mode']);
  });

  it('defaults to lesson mode for a beacon that sent nothing', () => {
    assert.equal(sessionEndRequestSchema.parse({}).mode, 'lesson');
  });
});

describe('lessonImportItemSchema (§3.4 — the /admin import contract)', () => {
  const valid = {
    languagePairCode: 'es-PY>en',
    level: 'A1',
    topic: 'Greetings',
    title: 'Saying hello',
    position: 1,
    content: {
      intro: 'Start with hello.',
      vocab: [{ term: 'hola', gloss: 'hello' }],
      exercises: [{ type: 'speak_prompt', prompt: 'Greet someone.' }],
    },
  };

  it('accepts a well-formed lesson', () => {
    assert.equal(lessonImportItemSchema.safeParse(valid).success, true);
  });

  it('defaults position and vocab so a minimal lesson still imports', () => {
    const parsed = lessonImportItemSchema.parse({
      ...valid,
      position: undefined,
      content: { intro: 'x', exercises: [{ type: 'speak_prompt', prompt: 'Greet someone.' }] },
    });
    assert.equal(parsed.position, 0);
    assert.deepEqual(parsed.content.vocab, []);
  });

  it('requires at least one exercise', () => {
    const parsed = lessonImportItemSchema.safeParse({
      ...valid,
      content: { ...valid.content, exercises: [] },
    });
    assert.equal(parsed.success, false);
  });

  it('requires a prompt on speak_prompt and both fields on listen_prompt', () => {
    const withExercise = (exercise: unknown) =>
      lessonImportItemSchema.safeParse({ ...valid, content: { ...valid.content, exercises: [exercise] } })
        .success;

    assert.equal(withExercise({ type: 'speak_prompt' }), false);
    assert.equal(withExercise({ type: 'listen_prompt', prompt: 'What did you hear?' }), false);
    assert.equal(withExercise({ type: 'listen_prompt', audioText: '¿Qué tal?' }), false);
    assert.equal(
      withExercise({ type: 'listen_prompt', audioText: '¿Qué tal?', prompt: 'What did you hear?' }),
      true,
    );
  });

  it('passes an unknown exercise type through untouched (§3.4 forward compatibility)', () => {
    const parsed = lessonImportItemSchema.parse({
      ...valid,
      content: {
        ...valid.content,
        exercises: [{ type: 'match_pairs', pairs: [['hola', 'hello']] }],
      },
    });
    assert.deepEqual(parsed.content.exercises[0], { type: 'match_pairs', pairs: [['hola', 'hello']] });
  });

  it('rejects a level outside the CEFR enum (§9 Q4)', () => {
    assert.equal(lessonImportItemSchema.safeParse({ ...valid, level: 'A0' }).success, false);
    assert.equal(lessonImportItemSchema.safeParse({ ...valid, level: 'C1' }).success, true);
  });

  it('rejects targetHints that are not strings', () => {
    const parsed = lessonImportItemSchema.safeParse({
      ...valid,
      content: {
        ...valid.content,
        exercises: [{ type: 'speak_prompt', prompt: 'Greet someone.', targetHints: [1, 2] }],
      },
    });
    assert.equal(parsed.success, false);
  });
});
