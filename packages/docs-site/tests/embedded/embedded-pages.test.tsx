import { APIReferencePage } from '../../src/components/api/api-reference-page';
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Manual, DocsRoot, DocsI18nProvider, commonMessages } from '@galacean/docs-site';
import type { APIManifest, ManualNavigationPage } from '@galacean/docs-site';

const messages = { ...commonMessages.en, manualIntro: 'Getting started' };
const pages: ManualNavigationPage[] = [
  { slug: 'intro', title: 'Introduction', group: 'Guides' },
  { slug: 'next', title: 'Next guide', group: 'Guides' },
];
const manualDocument = {
  text: '# Introduction\n\n[Next guide](../next/)\n\n## Details\nContent',
  headings: [{title: 'Details', level: 2}],
};
const entry = {
  key: 'custom-entry',
  id: 1,
  source: 'src/index.ts',
  types: 'dist/index.d.ts',
  symbols: [{ id: 10, name: 'Camera', kind: 256 }],
};
const current = {
  version: 'current',
  snapshot: 'a'.repeat(64),
  commit: 'abc',
  packageVersion: '1',
  json: { en: 'api/engine/preview/en.api.json' },
  entries: [entry],
  translatedLocales: ['en'],
};
const manifest: APIManifest = {
  schemaVersion: 2,
  defaultVersion: 'preview',
  packages: [
    {
      key: 'engine',
      name: 'Engine',
      latestVersion: '1',
      entries: [entry],
      current,
      versions: [
        { ...current, version: 'preview' },
        { ...current, version: 'previous' },
      ],
    },
  ],
};
const apiLoaders = {
  locale: 'en',
  messages,
  loadManifest: async () => manifest,
  loadAPI: async () => ({ index: { byId: new Map<number, object>([[10, {}]]) } }),
  getAPIHref: () => '/my-reference',
  getPackageHref: (_locale: string, key: string) => `/my-reference?library=${key}`,
  getSymbolHref: (_locale: string, key: string, version: string, symbol: string, entry: string) =>
    `/inspect/${symbol}?library=${key}&release=${version}&module=${entry}`,
  getGroupLabel: () => 'Classes',
  renderKind: () => null,
  renderPackageReadme: () => <p>Package content</p>,
  renderReflection: () => <p>Camera content</p>,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

describe('ordinary controlled React pages', () => {
  it('renders a manual with host loaders and callbacks, without any navigation provider', async () => {
    const navigate = vi.fn();
    const loadPage = vi.fn(async () => manualDocument);

    function Host() {
      const [slug, setSlug] = useState('intro');

      return (
        <DocsRoot lang="en" theme="dark">
          <Manual
            locale="en"
            slug={slug}
            messages={messages}
            href={({slug, anchor}) => '/help?doc=' + slug + (anchor ? '#' + anchor : '')}
            navigation={{location: { pathname: '/help', search: '?doc=' + slug, hash: '' },
            navigate: href => {
              navigate(href);
              setSlug(new URL(href, 'https://app.test').searchParams.get('doc')!);
            }}}
            source={{loadNavigation: async () => pages, loadOverview: async () => manualDocument, loadPage}}
          />
        </DocsRoot>
      );
    }
    render(<Host />);
    await screen.findByRole('heading', { name: 'Introduction' });
    const link = screen.getAllByRole('link', { name: 'Next guide' })[0]!;

    expect(screen.getByRole('link', {name: 'Details'}).getAttribute('href')).toMatch(/^\/help\?doc=intro#.+/u);
    expect(document.querySelector('.manual-article a')?.getAttribute('href')).toBe('/help?doc=next');
    expect(link.getAttribute('href')).toBe('/help?doc=next');
    window.document.addEventListener('click', event => event.preventDefault(), { once: true });
    fireEvent.click(link, { ctrlKey: true });
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith('/help?doc=next');
    expect(window.document.querySelectorAll('.docs-root')).toHaveLength(1);
    await waitFor(() => expect(loadPage).toHaveBeenCalledWith('en', 'next'));
  });

  it('keeps site and chapter links navigable while resolving attachments against the data URL', async () => {
    render(<Manual
      locale="en" slug="intro"
      href={({ slug, anchor }) => '/en/manual/' + (slug ? slug + '/' : '') + (anchor ? '#' + anchor : '')}
      source={{
        loadNavigation: async () => pages,
        loadOverview: async () => manualDocument,
        loadPage: async () => ({
          headings: [],
          text: '[API](../../api/) [Next](../next.md?tab=examples#setup) [PDF](./file.pdf?dl=1)',
        }),
        assetHref: (locale, path) => '/data/manual/' + locale + '/' + path,
      }}
    />);
    expect((await screen.findByRole('link', { name: 'API' })).getAttribute('href')).toBe('/en/api/');
    expect(document.querySelector('.manual-article a[href*="tab=examples"]')?.getAttribute('href'))
      .toBe('/en/manual/next/?tab=examples#setup');
    expect(screen.getByRole('link', { name: 'PDF' }).getAttribute('href'))
      .toBe('/data/manual/en/intro/file.pdf?dl=1');
  });

  it('honors configured text direction and an explicit root override', () => {
    const options = { localeDefinitions: { en: { label: 'English', direction: 'rtl' as const } } };
    const { container } = render(<DocsI18nProvider options={options}>
      <DocsRoot lang="en" /><DocsRoot lang="en" dir="ltr" />
    </DocsI18nProvider>);

    expect([...container.querySelectorAll('.docs-root')].map(root => root.getAttribute('dir')))
      .toEqual(['rtl', 'ltr']);
  });

  it('does not pick a default API package or read a package from the URL', async () => {
    const navigate = vi.fn();

    render(
      <APIReferencePage
        {...apiLoaders}
        navigation={{ location: { pathname: '/application', search: '?package=engine', hash: '' }, navigate }}
      />,
    );
    const link = await screen.findByRole('link', { name: 'Engine' });

    expect(navigate).not.toHaveBeenCalled();
    expect(link.getAttribute('href')).toBe('/my-reference?library=engine');
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith('/my-reference?library=engine');
  });

  it('uses API selection props even when the URL has different version, symbol and entry rules', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    const loadAPI = vi.fn(apiLoaders.loadAPI);
    const versionChanged = vi.fn();
    const navigate = vi.fn();

    render(
      <APIReferencePage
        {...apiLoaders}
        loadAPI={loadAPI}
        selection={{
          packageKey: 'engine',
          version: 'preview',
          entryKey: 'custom-entry',
          symbol: 'Camera',
        }}
        navigation={{
          location: { pathname: '/unrelated/url', search: '?entry=wrong&version=wrong&symbol=wrong', hash: '' },
          navigate,
        }}
        onVersionChange={versionChanged}
      />,
    );
    expect(await screen.findByText('Camera content')).toBeDefined();
    expect(loadAPI).toHaveBeenCalledWith('engine', 'preview', 'en');
    expect(screen.queryByRole('button', { name: messages.apiPackage })).toBeNull();
    expect(screen.getByText('Engine')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: messages.version }));
    fireEvent.click(screen.getByRole('option', { name: 'previous' }));
    expect(versionChanged).toHaveBeenCalledWith('previous');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('supports manual pages with native links when the application does not provide navigation', async () => {
    render(
      <Manual
        locale="en"
        slug="intro"
        messages={messages}
        href={({slug}) => `?page=${slug ?? ''}`}
        source={{loadNavigation: async () => pages, loadOverview: async () => manualDocument, loadPage: async () => manualDocument}}
      />,
    );
    await screen.findByRole('heading', { name: 'Introduction' });
    expect(window.document.querySelectorAll('.docs-root')).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Next guide' })[0]?.getAttribute('href')).toBe(
      '?page=next',
    );
  });
});
