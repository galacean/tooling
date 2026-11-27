import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Outlet, Route, Routes } from '../router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commonMessages, parseSearch, searchResults } from '@galacean/docs-site';
import type { SearchResult } from '@galacean/docs-site';
import { SearchPanel } from '../../src/components/search/search-panel';
import type {
  SearchPanelMessages,
  SearchPanelProps,
} from '../../src/components/search/search-panel';
import { SiteShell } from '../../src/components/site/site-shell';
import type { SiteShellProps } from '../../src/components/site/site-shell';

const messages: SearchPanelMessages = {
  search: 'Search',
  close: 'Close',
  searchPlaceholder: 'Search docs',
  manualSearchPlaceholder: 'Search manuals',
  storageError: 'Storage error',
  loading: 'Loading',
  loadError: 'Unable to load',
  retry: 'Retry',
  history: 'Recent searches',
  clear: 'Clear',
  searchHistoryEmpty: 'No recent searches',
  noResults: 'No results',
  delete: 'Delete',
  original: 'Original',
  api: 'API',
  manual: 'Manual',
};

function item(name: string, summary = ''): SearchResult {
  return {
    category: 'api',
    name,
    summary,
    keywords: 'IRScene',
    url: `/en/api/alpha/current/${name}/`,
    sourceLocale: 'en',
  };
}

const items = [
  item('createIR', 'Validate a scene'),
  item('validateIR'),
  item('IRScene', 'Animation model'),
];

describe('shared search query', () => {
  it('requires two characters, ignores case and whitespace, and prioritizes names', () => {
    expect(searchResults(items, 'v')).toEqual([]);
    expect(
      searchResults(items, ' VALIDATE ').map(result => result.name),
    ).toEqual(['validateIR', 'createIR']);
    expect(
      searchResults(items, 'animation').map(result => result.name),
    ).toEqual(['IRScene']);
    expect(searchResults(items, 'no match')).toEqual([]);
    expect(
      searchResults(
        Array.from({ length: 60 }, (_, index) => item(`IR${index}`)),
        'ir',
      ),
    ).toHaveLength(40);
  });

  it('supports conservative typo matching and requires every query term', () => {
    expect(searchResults(items, 'animaton').map(result => result.name)).toEqual([
      'IRScene',
    ]);
    expect(searchResults(items, 'a animation').map(result => result.name)).toEqual([
      'IRScene',
    ]);
    expect(searchResults(items, 'animation missing')).toEqual([]);
    expect(searchResults(items, 'validteIR').map(result => result.name)).toEqual([
      'validateIR',
    ]);
  });

  it('matches Chinese documents by full pinyin and initials', () => {
    const chinese = {
      ...item('计算方法', '中文 API'),
      pinyin: 'jisuanfangfazhongwenapi',
      pinyinInitials: 'jsffzw',
    };

    expect(searchResults([chinese], 'suanfa')).toEqual([chinese]);
    expect(searchResults([chinese], 'jsff')).toEqual([chinese]);
    expect(searchResults([chinese], 'jisuanfag')).toEqual([chinese]);
  });

  it('validates source locales from the consumer config', () => {
    const records = items.map(({url: _url, ...item}) => ({...item, target: {kind: 'package', locale: 'en', packageKey: 'alpha'}}));

    expect(parseSearch(records, ['en', 'zh-CN'])).toEqual(records);
    expect(() =>
      parseSearch([{ ...records[0], sourceLocale: 'fr' }], ['en', 'zh-CN']),
    ).toThrow('Invalid search index');
    expect(() =>
      parseSearch([{ ...records[0], summary: null }], ['en', 'zh-CN']),
    ).toThrow('Invalid search index');
    expect(() =>
      parseSearch([{ ...records[0], pinyin: 1 }], ['en', 'zh-CN']),
    ).toThrow('Invalid search index');
  });
});

describe('shared SearchPanel', () => {
  it('renders consumer-provided copy, brand, and empty history state', () => {
    const props: SearchPanelProps = {
      locale: 'en',
      brandLabel: 'Example Docs',
      brandMarkURL: '/brand.svg',
      historyKey: 'example:site:search:en',
      messages,
      loadItems: async () => items,

      close: () => undefined,
    };
    const markup = renderToStaticMarkup(createElement(SearchPanel, props));

    expect(markup).toContain('aria-labelledby="search-panel-title"');
    expect(markup).toContain('src="/brand.svg"');
    expect(markup).toContain('EXAMPLE DOCS / EN');
    expect(markup).toContain('No recent searches');
    expect(markup).toContain('class="search-panel-footer"');
    expect(markup).not.toContain('>Clear</button>');
  });
});

describe('shared SiteShell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['other', 'manual', 'api'] as const)(
    'composes consumer configuration for %s pages',
    pageKind => {
      vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
      const props: SiteShellProps = {
        locale: 'fr',
        navigation: {location: { pathname: '/fr', search: '', hash: '' }},
        languages: { options: [
          { value: 'fr', label: 'French' },
          { value: 'ja', label: 'Japanese' },
        ], href: locale => '/' + locale + '/' },
        messages: {
          ...commonMessages.en,
          ...messages,
          menu: 'Menu',
          theme: 'Theme',
          system: 'System',
          light: 'Light',
          dark: 'Dark',
          language: 'Language',
        },
        brand: { label: 'Example Docs', mark: {
          light: '/example/mark-light.svg',
          dark: '/example/mark-dark.svg',
        }},
        menu: [
          { key: 'start', label: 'Start here', to: '/fr', end: true },
        ],
        githubHref: 'https://github.com/example/docs',
        storageKeys: {
          locale: 'example:locale',
          theme: 'example:theme',
          searchHistory: 'example:search',
        },
        pageKind,
        search: async () => [],
        errorFallback: () => 'Content unavailable',
      };
      const markup = renderToStaticMarkup(
          <MemoryRouter initialEntries={['/fr']}>
            <Routes>
              <Route path="/fr" element={<SiteShell {...props}><Outlet /></SiteShell>}>
                <Route index element={<main>Article content</main>} />
              </Route>
            </Routes>
          </MemoryRouter>,
      );

      expect(markup).toContain('src="/example/mark-light.svg"');
      expect(markup).toContain('aria-label="Example Docs"');
      expect(markup).toContain('Start here</a>');
      expect(markup).toContain('aria-current="page"');
      expect(markup).toContain('<main>Article content</main>');
      expect(markup).not.toContain('Design Bridge');
      if (pageKind === 'api') {
        expect(markup).toContain('class="site-shell api-shell"');
      }
      if (pageKind === 'other') {
        expect(markup).toContain('class="site-footer"');
        expect(markup).toContain('href="https://github.com/example/docs"');
      } else {
        expect(markup).not.toContain('class="site-footer"');
      }
    },
  );
});
