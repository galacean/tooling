import Fuse from 'fuse.js';
import { normalizeSearchText, searchCharacterCount } from '../i18n/search-text';
import type { SearchResult } from './source';

type IndexedResult = SearchResult & { original: SearchResult };
const indexes = new WeakMap<SearchResult[], Fuse<IndexedResult>>();

function searchIndex(items: SearchResult[]): Fuse<IndexedResult> {
  let index = indexes.get(items);

  if (index === undefined) {
    const folded = items.map(item => ({ ...item, original: item,
      name: normalizeSearchText(item.name, item.sourceLocale),
      summary: normalizeSearchText(item.summary, item.sourceLocale),
      keywords: normalizeSearchText(item.keywords, item.sourceLocale),
    }));

    index = new Fuse(folded, {
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
  locale = 'en',
): SearchResult[] {
  const term = normalizeSearchText(query, locale).trim();

  if (searchCharacterCount(term, locale) < 2) {
    return [];
  }

  const terms = (term.match(/[\p{L}\p{N}\p{M}]+/gu) ?? []).filter(
    value => searchCharacterCount(value, locale) >= 2,
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
    fuse.search(firstTerm).map(result => [result.item.original, result.score ?? 1]),
  );

  for (const searchTerm of remainingTerms) {
    const termScores = new Map(
      fuse.search(searchTerm).map(result => [result.item.original, result.score ?? 1]),
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
