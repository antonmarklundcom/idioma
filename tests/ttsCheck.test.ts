import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { phraseFor, ttsCheckReason } from '@/lib/ttsCheck';

// The admin voice check exists so that four very different problems - no key, no voice
// on the pair, an API that is not enabled, a voice Google does not know - stop looking
// identical from the outside. Which one it reports is the whole feature.

describe('phraseFor', () => {
  it('speaks the voice’s own language', () => {
    assert.match(phraseFor('es-US-Neural2-A'), /practicar/);
    assert.match(phraseFor('en-US-Neural2-C'), /practise/);
    assert.match(phraseFor('sv-SE-Wavenet-A'), /övar/);
  });

  it('falls back to a phrase rather than to silence for an unknown language', () => {
    // Hearing the wrong language still proves key + API + voice all work, which is
    // what the check is for.
    assert.ok(phraseFor('gn-PY-Standard-A').length > 0);
  });

  it('is not confused by casing', () => {
    assert.equal(phraseFor('ES-us-Neural2-A'), phraseFor('es-US-Neural2-A'));
  });
});

describe('ttsCheckReason', () => {
  it('reports success when the audio came back', () => {
    assert.equal(
      ttsCheckReason({ keyConfigured: true, voice: 'es-US-Neural2-A', synthesized: true }),
      'ok',
    );
  });

  it('blames the missing key when there is one to blame', () => {
    assert.equal(
      ttsCheckReason({ keyConfigured: false, voice: 'es-US-Neural2-A', synthesized: false }),
      'no_api_key',
    );
  });

  it('says Google refused when the key is there and the call still failed', () => {
    assert.equal(
      ttsCheckReason({ keyConfigured: true, voice: 'es-US-Neural2-A', synthesized: false }),
      'google_refused',
    );
  });

  it('calls a voiceless pair text-only, even when the key is also missing', () => {
    // The precedence matters: sending the owner off to set an environment variable
    // that would change nothing for this pair is worse than saying nothing.
    assert.equal(
      ttsCheckReason({ keyConfigured: false, voice: null, synthesized: false }),
      'no_voice_configured',
    );
    assert.equal(
      ttsCheckReason({ keyConfigured: true, voice: null, synthesized: false }),
      'no_voice_configured',
    );
  });
});
