/** Search-only folding; never use this to transform displayed or archived text. */
export function normalizeSearchText(value: string, locale = 'en'): string {
  return value.normalize('NFKC').toLocaleLowerCase(locale).normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .replace(/ß/gu, 'ss').normalize('NFC');
}

export function searchCharacterCount(value: string, locale = 'en'): number {
  return typeof Intl.Segmenter === 'undefined' ? Array.from(value).length :
    Array.from(new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(value)).length;
}
