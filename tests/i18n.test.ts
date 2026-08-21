import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeLocale, t, type Locale } from '@/lib/i18n';

// PLAN.md §8 Phase 8 / §9 Q12. TypeScript already makes a MISSING key a compile
// error; what it cannot catch is a translation left as an empty string, or a
// pluralizing helper that silently ignores the count it was handed. Those show up
// as a blank label on someone's phone, in the one language they read.

const LOCALES: Locale[] = ['en', 'es', 'sv'];

type Node = Record<string, unknown>;

function leafKind(value: unknown): string {
  // Arity matters as much as the type: a Swedish helper that ignores the count it
  // was handed renders "reviews waiting" with no number in it.
  return typeof value === 'function' ? `fn/${(value as (...args: unknown[]) => unknown).length}` : typeof value;
}

function walk(node: Node, path: string[], visit: (path: string[], value: unknown) => void) {
  for (const [key, value] of Object.entries(node)) {
    const next = [...path, key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      walk(value as Node, next, visit);
    } else {
      visit(next, value);
    }
  }
}

describe('dictionary parity', () => {
  it('gives every locale the same leaves, of the same kind and arity', () => {
    const shape = new Map<string, string>();
    walk(t('en') as unknown as Node, [], (path, value) => {
      shape.set(path.join('.'), leafKind(value));
    });

    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      const seen = new Set<string>();
      walk(t(locale) as unknown as Node, [], (path, value) => {
        const key = path.join('.');
        seen.add(key);
        const kind = leafKind(value);
        assert.equal(kind, shape.get(key), `${locale}.${key} is a ${kind}, en has ${shape.get(key)}`);
      });
      for (const key of shape.keys()) {
        assert.ok(seen.has(key), `${locale} is missing ${key}`);
      }
    }
  });

  it('has no blank strings in any locale', () => {
    for (const locale of LOCALES) {
      walk(t(locale) as unknown as Node, [], (path, value) => {
        if (typeof value !== 'string') return;
        assert.ok(value.trim().length > 0, `${locale}.${path.join('.')} is blank`);
      });
    }
  });

  it('returns a distinct dictionary per locale', () => {
    assert.notEqual(t('en').nav.dashboard, t('sv').nav.dashboard);
    assert.notEqual(t('en').nav.settings, t('es').nav.settings);
  });
});

describe('pluralizing and interpolating helpers', () => {
  it('uses the count it is given, in every locale', () => {
    for (const locale of LOCALES) {
      const one = t(locale).dashboard.reviewWaiting(1, 1);
      const many = t(locale).dashboard.reviewWaiting(7, 3);
      assert.match(one, /\b1\b/, `${locale} drops the count`);
      assert.match(many, /\b7\b/, `${locale} drops the count`);
      assert.match(many, /\b3\b/, `${locale} drops the minutes`);
      assert.notEqual(one, many);
    }
  });

  it('interpolates a name when there is one and stays natural when there is not', () => {
    for (const locale of LOCALES) {
      const named = t(locale).dashboard.welcomeBack('Ana');
      assert.match(named, /Ana/, `${locale} drops the name`);
      const anonymous = t(locale).dashboard.welcomeBack();
      assert.ok(anonymous.trim().length > 0);
      assert.ok(!anonymous.includes('undefined'), `${locale} leaks "undefined"`);
    }
  });
});

describe('normalizeLocale', () => {
  it('strips the dialect suffix that users.nativeLang carries', () => {
    assert.equal(normalizeLocale('es-PY'), 'es');
    assert.equal(normalizeLocale('en-US'), 'en');
  });

  it('accepts the bare codes', () => {
    assert.equal(normalizeLocale('en'), 'en');
    assert.equal(normalizeLocale('es'), 'es');
    assert.equal(normalizeLocale('sv'), 'sv');
  });

  it('is case-insensitive', () => {
    assert.equal(normalizeLocale('SV'), 'sv');
    assert.equal(normalizeLocale('es-py'), 'es');
  });

  it('falls back to English rather than crashing on null or nonsense', () => {
    assert.equal(normalizeLocale(null), 'en');
    assert.equal(normalizeLocale(undefined), 'en');
    assert.equal(normalizeLocale(''), 'en');
    assert.equal(normalizeLocale('gn-PY'), 'en');
  });
});
