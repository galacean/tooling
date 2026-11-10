import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseSearch,
  searchResults,
} from '@galacean/docs-site';
import { SearchPanel } from '../../src/components/search/search-panel';
import type {
  SearchPanelMessages,
  SearchPanelProps,
} from '../../src/components/search/search-panel';
import type { SearchResult } from '@galacean/docs-site';
import { SiteShell } from '../../src/components/site/site-shell';
import type { SiteShellProps } from '../../src/components/site/site-shell';
import { ThemeProvider } from '../../src/providers/theme';

const messages: SearchPanelMessages = {
  search: 'Search',
  close: 'Close',
  searchPlaceholder: 'Search docs',
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

  it('validates source locales from the consumer config', () => {
    expect(parseSearch(items, ['en', 'zh-CN'])).toEqual(items);
    expect(() =>
      parseSearch([{ ...items[0], sourceLocale: 'fr' }], ['en', 'zh-CN']),
    ).toThrow('Invalid search index');
    expect(() =>
      parseSearch([{ ...items[0], summary: null }], ['en', 'zh-CN']),
    ).toThrow('Invalid search index');
  });
});

describe('shared SearchPanel', () => {
  it('renders consumer-provided copy, brand, and empty history state', () => {
    const props: SearchPanelProps = {
      locale: 'en',
      brandLabel: 'Example Docs',
      brandMarkUrl: '/brand.svg',
      historyKeyPrefix: 'example:site:search',
      messages,
      loadItems: async () => items,
      navigate: () => undefined,
      close: () => undefined,
    };
    const markup = renderToStaticMarkup(
      createElement(SearchPanel, props),
    );

    expect(markup).toContain('aria-labelledby="site-search-title"');
    expect(markup).toContain('src="/brand.svg"');
    expect(markup).toContain('EXAMPLE DOCS / EN');
    expect(markup).toContain('No recent searches');
    expect(markup).toContain('class="site-search-footer"');
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
        locales: [
          { value: 'fr', label: 'French' },
          { value: 'ja', label: 'Japanese' },
        ],
        messages: {
          ...messages,
          menu: 'Menu',
          theme: 'Theme',
          system: 'System',
          light: 'Light',
          dark: 'Dark',
          language: 'Language',
        },
        brandLabel: 'Example Docs',
        brandMarkUrls: {
          light: '/example/mark-light.svg',
          dark: '/example/mark-dark.svg',
        },
        homeHref: '/fr',
        navigation: [
          { key: 'start', label: 'Start here', to: '/fr', end: true },
        ],
        githubHref: 'https://github.com/example/docs',
        historyKeyPrefix: 'example:search',
        pageKind,
        canonicalHref: 'https://example.test/docs/fr/',
        getAlternateHref: locale => `https://example.test/docs/${locale}/`,
        getLocaleHref: locale => `/${locale}/`,
        loadSearchItems: async () => [],
        errorFallback: () => 'Content unavailable',
      };
      const markup = renderToStaticMarkup(
        <ThemeProvider namespace="example:docs">
          <MemoryRouter initialEntries={['/fr']}>
            <Routes>
              <Route path="/fr" element={<SiteShell {...props} />}>
                <Route index element={<main>Article content</main>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ThemeProvider>,
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
