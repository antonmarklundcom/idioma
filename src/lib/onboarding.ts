// ROADMAP.md P3.13: preselect the sv-native language pair from the browser's
// Accept-Language header when the learner hasn't chosen one yet — the mom/dad path
// is a parent whose phone is already set to Swedish, and making them find "Spanish
// (Paraguay) för svensktalande" in a list is exactly the kind of friction this item
// exists to remove.

/** The browser's most-preferred language tag's primary subtag, lower-cased - 'sv'
 * from 'sv-SE,sv;q=0.9,en-US;q=0.8', or null for a missing/empty header. */
export function preferredLanguageFromAcceptLanguage(acceptLanguage: string | null): string | null {
  if (!acceptLanguage?.trim()) return null;
  const first = acceptLanguage.split(',')[0]?.trim();
  const tag = first?.split(';')[0]?.trim();
  const primary = tag?.split('-')[0]?.toLowerCase();
  return primary || null;
}

export type LanguagePairForPreselect = { id: string; nativeLang: string };

/**
 * The pair to preselect, or null to leave the form's own default (the first pair)
 * alone. Only acts on Swedish - every other browser language already gets a
 * reasonable default from the pair list order.
 */
export function pickPreselectedLanguagePairId(
  pairs: LanguagePairForPreselect[],
  acceptLanguage: string | null,
): string | null {
  if (preferredLanguageFromAcceptLanguage(acceptLanguage) !== 'sv') return null;
  return pairs.find((pair) => pair.nativeLang === 'sv')?.id ?? null;
}
