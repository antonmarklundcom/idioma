import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TONES,
  readSoundPreference,
  toneDuration,
  writeSoundPreference,
  type UiSound,
} from '@/lib/uiSounds';

// The sounds are decoration, so the rules worth testing are the ones that stop them
// becoming an annoyance: nothing long, nothing loud, and nothing that throws into a
// click handler on a device with no audio or no storage.

const ALL: UiSound[] = ['tap', 'listening', 'sent', 'success', 'miss', 'error', 'complete'];

describe('the sound table', () => {
  it('has a tone for every sound the app asks for', () => {
    for (const sound of ALL) assert.ok(TONES[sound], `${sound} has no tone`);
  });

  it('keeps every sound short enough not to be waited out', () => {
    for (const sound of ALL) {
      const duration = toneDuration(sound);
      assert.ok(duration > 0, `${sound} is silent`);
      assert.ok(duration <= 0.5, `${sound} lasts ${duration}s - too long to sit through`);
    }
  });

  it('stays quiet enough to sit next to a speaking voice', () => {
    for (const sound of ALL) {
      assert.ok(TONES[sound].gain <= 0.2, `${sound} is loud enough to talk over the tutor`);
    }
  });

  it('keeps every note in a range a phone speaker can actually produce', () => {
    for (const sound of ALL) {
      for (const freq of TONES[sound].freqs) {
        assert.ok(freq >= 200 && freq <= 2000, `${sound} has a ${freq}Hz note`);
      }
    }
  });

  it('says good news by rising and bad news by falling', () => {
    const rises = (freqs: number[]) => freqs.every((f, i) => i === 0 || f > freqs[i - 1]);
    const falls = (freqs: number[]) => freqs.every((f, i) => i === 0 || f < freqs[i - 1]);
    assert.ok(rises(TONES.success.freqs), 'success should rise');
    assert.ok(rises(TONES.complete.freqs), 'completion should rise');
    assert.ok(falls(TONES.miss.freqs), 'a miss should fall');
    assert.ok(falls(TONES.error.freqs), 'an error should fall');
  });
});

describe('the per-device preference', () => {
  it('is on for a device that has never said otherwise', () => {
    assert.equal(readSoundPreference(), true);
  });

  it('survives having no localStorage at all rather than throwing', () => {
    // Node has no localStorage, which is exactly the shape of the problem a locked
    // -down browser presents: the read must answer, not explode.
    assert.doesNotThrow(() => readSoundPreference());
    assert.doesNotThrow(() => writeSoundPreference(false));
  });
});
