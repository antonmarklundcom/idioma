import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getCachedListenAudio,
  listenAudioKey,
  setCachedListenAudio,
} from '@/lib/listenAudioCache';

// PLAN.md §5B/§6.12. This cache exists to stop a replayed listening prompt re-billing
// the same characters against the 1M/month allotment. The correctness risk is the
// opposite one: a key too coarse would serve last week's audio for words a lesson no
// longer contains.

const base = {
  lessonId: 'lesson-1',
  exerciseIndex: 0,
  voice: 'es-US-Neural2-A',
  speakingRate: 0.9,
  audioText: '¿Dónde está el baño?',
};

describe('listenAudioKey', () => {
  it('is stable for identical inputs', () => {
    assert.equal(listenAudioKey(base), listenAudioKey({ ...base }));
  });

  it('changes when anything that changes the BYTES changes', () => {
    const variants = [
      { ...base, audioText: '¿Dónde está la salida?' },
      { ...base, voice: 'en-US-Neural2-C' },
      { ...base, speakingRate: 1 },
      { ...base, exerciseIndex: 1 },
      { ...base, lessonId: 'lesson-2' },
    ];
    const keys = new Set(variants.map(listenAudioKey));
    keys.add(listenAudioKey(base));
    assert.equal(keys.size, variants.length + 1, 'two different inputs collided on one key');
  });

  it('stops matching when a lesson is edited through /admin', () => {
    const before = listenAudioKey(base);
    const after = listenAudioKey({ ...base, audioText: `${base.audioText} por favor` });
    assert.notEqual(before, after, 'an edited lesson would keep serving the old recording');
  });

  it('does not embed the raw text — the key is a bounded identifier, not the payload', () => {
    const key = listenAudioKey(base);
    assert.ok(!key.includes(base.audioText));
    assert.ok(key.startsWith(`${base.lessonId}|${base.exerciseIndex}|${base.voice}|`));
  });
});

describe('cache reads and eviction', () => {
  it('round-trips a stored entry', () => {
    const key = listenAudioKey({ ...base, lessonId: 'roundtrip' });
    setCachedListenAudio(key, { audioBase64: 'AAAA', charCount: 20 });
    assert.deepEqual(getCachedListenAudio(key), { audioBase64: 'AAAA', charCount: 20 });
  });

  it('misses on an unknown key', () => {
    assert.equal(getCachedListenAudio(listenAudioKey({ ...base, lessonId: 'never-stored' })), undefined);
  });

  it('evicts the least recently USED entry, not the oldest one', () => {
    const key = (n: number) => listenAudioKey({ ...base, lessonId: `evict-${n}` });

    // Fill well past any plausible cap, keeping entry 0 in active rotation.
    for (let i = 0; i < 200; i++) {
      setCachedListenAudio(key(i), { audioBase64: `a${i}`, charCount: i });
      getCachedListenAudio(key(0)); // the lesson someone is actually practising
    }

    assert.ok(getCachedListenAudio(key(0)), 'the actively replayed entry was evicted');
    assert.equal(getCachedListenAudio(key(1)), undefined, 'a one-off entry should have aged out');
    assert.ok(getCachedListenAudio(key(199)), 'the newest entry should still be resident');
  });
});
