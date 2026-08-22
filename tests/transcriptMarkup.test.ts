import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { correctionIsMeaningful, markUpTranscript } from '@/lib/transcriptMarkup';
import type { UtteranceError } from '@/lib/db/schema';

// The learner reads this sentence to find out what they got wrong, so the failure
// mode that matters is marking the WRONG words - it looks authoritative either way.

function err(quote: string, correction = 'x'): UtteranceError {
  return {
    category: 'grammar',
    severity: 'moderate',
    quote,
    correction,
    explanation: 'because',
    patternKey: 'k',
  };
}

const text = (r: ReturnType<typeof markUpTranscript>) => r.segments.map((s) => s.text).join('');
const marked = (r: ReturnType<typeof markUpTranscript>) =>
  r.segments.filter((s) => s.error).map((s) => s.text);

describe('markUpTranscript', () => {
  it('returns the transcript untouched when nothing was wrong', () => {
    const result = markUpTranscript('I am from Paraguay.', []);
    assert.equal(text(result), 'I am from Paraguay.');
    assert.deepEqual(marked(result), []);
  });

  it('never loses or reorders a character of what the learner said', () => {
    const transcript = 'I have 30 years and I am from Paraguay.';
    const result = markUpTranscript(transcript, [err('have 30 years'), err('I am')]);
    assert.equal(text(result), transcript);
  });

  it('marks each quoted span in place', () => {
    const result = markUpTranscript('I have 30 years, and I go to work by bus.', [
      err('have 30 years'),
      err('by bus'),
    ]);
    assert.deepEqual(marked(result), ['have 30 years', 'by bus']);
  });

  it('matches through case and accents, which the model is inconsistent about', () => {
    const result = markUpTranscript('Yo esta cansado hoy.', [err('Está cansado')]);
    assert.deepEqual(marked(result), ['esta cansado']);
  });

  it('gives two errors quoting the same words two different occurrences', () => {
    const result = markUpTranscript('the cat sat on the cat', [err('the cat'), err('the cat')]);
    assert.deepEqual(marked(result), ['the cat', 'the cat']);
    assert.equal(text(result), 'the cat sat on the cat');
  });

  it('reports an error it cannot place instead of dropping it', () => {
    const result = markUpTranscript('I am from Paraguay.', [err('tengo 30 años')]);
    assert.equal(marked(result).length, 0);
    assert.equal(result.unmatched.length, 1);
  });

  it('does not draw a second box over a span already marked', () => {
    const result = markUpTranscript('I go by bus', [err('by bus'), err('by bus')]);
    assert.deepEqual(marked(result), ['by bus']);
    assert.equal(result.unmatched.length, 1);
  });

  it('survives an empty quote and an empty transcript', () => {
    assert.deepEqual(markUpTranscript('hello', [err('')]).segments, [{ text: 'hello' }]);
    assert.deepEqual(markUpTranscript('', [err('hi')]).segments, []);
    assert.equal(markUpTranscript('', [err('hi')]).unmatched.length, 1);
  });

  it('keeps segments in reading order even when the errors arrive out of order', () => {
    const result = markUpTranscript('one two three', [err('three'), err('one')]);
    assert.deepEqual(
      result.segments.map((s) => s.text),
      ['one', ' two ', 'three'],
    );
  });
});

describe('correctionIsMeaningful', () => {
  it('is false when the correction only differs in punctuation, case or accents', () => {
    assert.equal(correctionIsMeaningful('yo soy de paraguay', 'Yo soy de Paraguay.'), false);
    assert.equal(correctionIsMeaningful('esta bien', 'Está bien'), false);
    assert.equal(correctionIsMeaningful('I  am   tired', 'I am tired'), false);
  });

  it('is true when the words actually changed', () => {
    assert.equal(correctionIsMeaningful('I have 30 years', "I'm 30"), true);
  });

  it('is false for an empty or missing correction', () => {
    assert.equal(correctionIsMeaningful('I am tired', ''), false);
    assert.equal(correctionIsMeaningful('I am tired', '   '), false);
  });
});
