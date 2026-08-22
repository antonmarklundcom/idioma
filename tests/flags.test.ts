import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UNKNOWN_LANGUAGE_FLAG, flagForLanguage } from '@/lib/flags';

// ROADMAP.md P0.2. The flags are the whole label on the app-language switcher, so
// the mapping is user-visible text: es-PY must read Paraguayan, not Spanish, and
// an unseeded pair must not be given a country it has nothing to do with.
describe('flagForLanguage', () => {
  it('maps the seeded target languages', () => {
    assert.equal(flagForLanguage('es-PY'), '🇵🇾');
    assert.equal(flagForLanguage('en'), '🇬🇧');
    assert.equal(flagForLanguage('sv'), '🇸🇪');
  });

  it('defaults bare Spanish to Paraguay - the dialect the tutor speaks', () => {
    assert.equal(flagForLanguage('es'), '🇵🇾');
  });

  it('lets an explicit region override the language default', () => {
    assert.equal(flagForLanguage('es-ES'), '🇪🇸');
    assert.equal(flagForLanguage('en-US'), '🇺🇸');
    // Guaraní has no flag of its own; the region still places it.
    assert.equal(flagForLanguage('gn-PY'), '🇵🇾');
  });

  it('is case- and whitespace-tolerant about the tag', () => {
    assert.equal(flagForLanguage(' ES-py '), '🇵🇾');
  });

  it('falls back to a globe rather than guessing', () => {
    for (const tag of ['de', 'gn', '', null, undefined]) {
      assert.equal(flagForLanguage(tag), UNKNOWN_LANGUAGE_FLAG, `${tag} should not get a flag`);
    }
  });
});
