// ROADMAP.md P0.2: the flag shown next to a language. Regional tags win over the
// bare language, which is what makes es-PY Paraguayan rather than Spanish - the
// owner's decision, and the dialect the tutor actually speaks. Anything unknown
// falls back to a globe rather than guessing a country at a learner.
const REGION_FLAGS: Record<string, string> = {
  PY: '🇵🇾',
  GB: '🇬🇧',
  SE: '🇸🇪',
  ES: '🇪🇸',
  US: '🇺🇸',
  AR: '🇦🇷',
  MX: '🇲🇽',
};

const LANGUAGE_FLAGS: Record<string, string> = {
  es: '🇵🇾',
  en: '🇬🇧',
  sv: '🇸🇪',
};

export const UNKNOWN_LANGUAGE_FLAG = '🌍';

/** Flag for a BCP-47-ish tag as stored in `language_pairs.target_lang` ('es-PY', 'en', 'sv'). */
export function flagForLanguage(tag: string | null | undefined): string {
  if (!tag) return UNKNOWN_LANGUAGE_FLAG;
  const [language, region] = tag.trim().split('-');
  if (region && REGION_FLAGS[region.toUpperCase()]) return REGION_FLAGS[region.toUpperCase()];
  return LANGUAGE_FLAGS[language.toLowerCase()] ?? UNKNOWN_LANGUAGE_FLAG;
}
