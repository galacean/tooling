import { isDocsTarget } from '../routing/targets';
import type { DocsTarget, ManualTarget, APITarget } from '../routing/targets';
import { loadJSON } from '../data/load-resource';
import { withTrailingSlash } from '../config/urls';
import { isRecord } from '../data/typedoc-project';

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

export type SearchRecord = Omit<SearchResult, 'url'> & { target: DocsTarget };

export function parseSearch(
  value: unknown,
  locales: readonly string[],
): SearchRecord[] {
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
        isDocsTarget(item.target) &&
        locales.includes(item.target.locale) &&
        (item.category === 'manual') === (item.target.kind === 'manual') &&
        locales.includes(String(item.sourceLocale)),
    );

  if (!valid) {
    throw new Error('Invalid search index');
  }

  return value as SearchRecord[];
}

interface SearchLinks {
  manual?: (target: ManualTarget) => string;
  api?: (target: APITarget) => string;
}

export function resolveSearchItems(records: SearchRecord[], links: SearchLinks): SearchResult[] {
  return records.flatMap(({ target, ...item }) => {
    const url = target.kind === 'manual' ? links.manual?.(target) : links.api?.(target);

    return url === undefined ? [] : [{ ...item, url }];
  });
}

export function createDocsSearch({
  baseURL,
  locales,
  ...links
}: SearchLinks & { baseURL: string; locales: readonly string[] }) {
  const base = withTrailingSlash(baseURL);

  return async (locale: string) => {
    const data = await loadJSON(`${base}data/search/${encodeURIComponent(locale)}.json`);

    return resolveSearchItems(parseSearch(data, locales), links);
  };
}
