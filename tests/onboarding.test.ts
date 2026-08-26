import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  pickPreselectedLanguagePairId,
  preferredLanguageFromAcceptLanguage,
} from '@/lib/onboarding';

describe('preferredLanguageFromAcceptLanguage', () => {
  it('reads the primary subtag of the first, highest-priority tag', () => {
    assert.equal(preferredLanguageFromAcceptLanguage('sv-SE,sv;q=0.9,en-US;q=0.8'), 'sv');
  });

  it('lower-cases the result', () => {
    assert.equal(preferredLanguageFromAcceptLanguage('SV-SE'), 'sv');
  });

  it('handles a bare language tag with no region or quality', () => {
    assert.equal(preferredLanguageFromAcceptLanguage('en'), 'en');
  });

  it('returns null for a missing header', () => {
    assert.equal(preferredLanguageFromAcceptLanguage(null), null);
  });

  it('returns null for an empty or blank header', () => {
    assert.equal(preferredLanguageFromAcceptLanguage(''), null);
    assert.equal(preferredLanguageFromAcceptLanguage('   '), null);
  });
});

describe('pickPreselectedLanguagePairId', () => {
  const pairs = [
    { id: 'en-pair', nativeLang: 'es-PY' },
    { id: 'es-pair', nativeLang: 'en' },
    { id: 'sv-pair', nativeLang: 'sv' },
  ];

  it('preselects the sv-native pair when the browser prefers Swedish', () => {
    assert.equal(pickPreselectedLanguagePairId(pairs, 'sv-SE,sv;q=0.9'), 'sv-pair');
  });

  it('leaves the default alone (null) for any other browser language', () => {
    assert.equal(pickPreselectedLanguagePairId(pairs, 'en-US,en;q=0.9'), null);
    assert.equal(pickPreselectedLanguagePairId(pairs, 'es-PY'), null);
  });

  it('leaves the default alone when no sv-native pair exists', () => {
    const noSwedish = pairs.filter((p) => p.nativeLang !== 'sv');
    assert.equal(pickPreselectedLanguagePairId(noSwedish, 'sv-SE'), null);
  });

  it('leaves the default alone for a missing header', () => {
    assert.equal(pickPreselectedLanguagePairId(pairs, null), null);
  });
});
