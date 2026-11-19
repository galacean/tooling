import { isRecord } from '../data';
import Fuse from 'fuse.js';

export interface SearchResult {
  category: 'api' | 'manual';
  name: string;
  summary: string;
  keywords: string;
  pinyin?: string;
  pinyinInitials?: string;
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
        (item['pinyin'] === undefined ||
          typeof item['pinyin'] === 'string') &&
        (item['pinyinInitials'] === undefined ||
          typeof item['pinyinInitials'] === 'string') &&
        typeof item.url === 'string' &&
        locales.includes(String(item.sourceLocale)),
    );

  if (!valid) {
    throw new Error('Invalid search index');
  }

  return value as SearchResult[];
}

const indexes = new WeakMap<SearchResult[], Fuse<SearchResult>>();

function searchIndex(items: SearchResult[]): Fuse<SearchResult> {
  let index = indexes.get(items);

  if (index === undefined) {
    index = new Fuse(items, {
      ignoreLocation: true,
      threshold: 0.32,
      minMatchCharLength: 2,
      keys: [
        { name: 'name', weight: 5 },
        { name: 'pkg', weight: 3 },
        { name: 'summary', weight: 2 },
        { name: 'pinyin', weight: 1.5 },
        { name: 'pinyinInitials', weight: 1 },
        { name: 'keywords', weight: 0.5 },
      ],
    });
    indexes.set(items, index);
  }

  return index;
}

export function searchResults(
  items: SearchResult[],
  query: string,
): SearchResult[] {
  const term = query.normalize('NFKC').trim();

  if (Array.from(term).length < 2) {
    return [];
  }

  const terms = (term.match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) ?? []).filter(
    value => Array.from(value).length >= 2,
  );

  if (terms.length === 0) {
    return [];
  }

  const fuse = searchIndex(items);
  const [firstTerm, ...remainingTerms] = terms;

  if (firstTerm === undefined) {
    return [];
  }

  const scores = new Map(
    fuse.search(firstTerm).map(result => [result.item, result.score ?? 1]),
  );

  for (const searchTerm of remainingTerms) {
    const termScores = new Map(
      fuse.search(searchTerm).map(result => [result.item, result.score ?? 1]),
    );

    for (const [item, score] of scores) {
      const termScore = termScores.get(item);

      if (termScore === undefined) {
        scores.delete(item);
      } else {
        scores.set(item, score + termScore);
      }
    }
  }

  return [...scores]
    .sort((left, right) => left[1] - right[1])
    .map(([item]) => item)
    .slice(0, 40);
}
