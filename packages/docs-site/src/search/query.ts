import { isRecord } from '../data';

export interface SearchResult {
  category: 'api' | 'manual';
  name: string;
  summary: string;
  keywords: string;
  sourceLocale: string;
  url: string;
  pkg?: string;
  version?: string;
  kind?: number;
}

export function parseSearch(
  value: unknown,
  locales: readonly string[],
): SearchResult[] {
  if (
    !Array.isArray(locales) ||
    locales.some(locale => typeof locale !== 'string')
  ) {
    throw new Error('Invalid configured locales');
  }
  const valid =
    Array.isArray(value) &&
    value.every(
      item =>
        isRecord(item) &&
        (item.category === 'api' || item.category === 'manual') &&
        typeof item.name === 'string' &&
        typeof item.summary === 'string' &&
        typeof item.keywords === 'string' &&
        typeof item.url === 'string' &&
        locales.includes(String(item.sourceLocale)),
    );

  if (!valid) {
    throw new Error('Invalid search index');
  }

  return value as SearchResult[];
}

export function searchResults(
  items: SearchResult[],
  query: string,
): SearchResult[] {
  const term = query.trim().toLowerCase();

  if (term.length < 2) {
    return [];
  }

  return items
    .filter(item =>
      `${item.name} ${item.summary} ${item.keywords} ${item.pkg ?? ''}`
        .toLowerCase()
        .includes(term),
    )
    .sort(
      (left, right) =>
        Number(right.name.toLowerCase().startsWith(term)) -
        Number(left.name.toLowerCase().startsWith(term)),
    )
    .slice(0, 40);
}
