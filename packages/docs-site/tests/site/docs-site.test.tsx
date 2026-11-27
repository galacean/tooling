// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, useLocation } from 'react-router-dom';
import { commonMessages, DocsSite } from '@galacean/docs-site';
import type {
  DocsRoutePaths,
  DocsSitePage,
  DocsSiteStorageKeyOverrides,
} from '@galacean/docs-site';

const locales = ['en', 'zh-CN'] as const;

function SiteProbe() {
  const location = useLocation();

  return (
    <output>{`${location.pathname}${location.search}${location.hash}`}</output>
  );
}

function renderSite(
  baseURL = '/',
  dataBaseURL = baseURL,
  includeAPI = true,
  manualDataURL?: string,
  customPages: readonly DocsSitePage<(typeof locales)[number]>[] = [],
  storageKeys?: DocsSiteStorageKeyOverrides,
  includeManual = true,
  routePaths?: DocsRoutePaths,
) {
  const pages: DocsSitePage<(typeof locales)[number]>[] = [
    {
      slug: null,
      render: locale => (
        <>
          <p>home:{locale}</p>
          <SiteProbe />
        </>
      ),
    },
    ...customPages,
  ];

  return render(
    <DocsSite
      config={{
        baseURL,
        ...(routePaths === undefined ? {} : { routePaths }),
        dataBaseURL,
        locales,
        defaultLocale: 'zh-CN',
        manual: includeManual ? (manualDataURL === undefined ? true : { dataURL: manualDataURL }) : false,
        brandLabel: 'Shared docs',
        brandMarkURLs: { light: '/brand-light.svg', dark: '/brand-dark.svg' },
        ...(storageKeys === undefined ? {} : { storageKeys }),
        localeLabels: { en: 'English', 'zh-CN': '简体中文' },
        messages: locale => ({
          ...commonMessages[locale],
          manualIntro: 'Manual introduction',
        }),
        ...(includeAPI
          ? {
              api: {
                sourceLinkTemplate:
                  'https://example.test/blob/{commit}/{path}#L{line}',
                rawAssetURLTemplate: 'https://example.test/raw/{path}{search}',
                packageReadmes: {},
              },
            }
          : {}),
      }}
      pages={pages}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('navigator', { languages: ['zh-CN'], language: 'zh-CN' });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('DocsSite routing', () => {
  it('uses locale and theme defaults when only search history is configured', async () => {
    const values = new Map([
      ['locale', 'en'],
      ['theme', 'dark'],
    ]);
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };

    vi.stubGlobal('localStorage', storage);
    window.history.replaceState({}, '', '/');
    renderSite('/', '/', false);

    expect(await screen.findByText('home:en')).toBeDefined();
    expect(document.querySelector<HTMLElement>('.docs-root')?.dataset['theme']).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(screen.getByRole('option', { name: 'Light' }));
    expect(values.get('theme')).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'Language' }));
    fireEvent.click(screen.getByRole('option', { name: '简体中文' }));
    expect(await screen.findByText('home:zh-CN')).toBeDefined();
    expect(values.get('locale')).toBe('zh-CN');
  });

  it('uses configured complete localStorage keys for locale and theme', async () => {
    const values = new Map([
      ['umi_locale', 'en'],
      ['custom_theme', 'dark'],
    ]);
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };

    vi.stubGlobal('localStorage', storage);
    window.history.replaceState({}, '', '/');
    renderSite(
      '/',
      '/',
      false,
      undefined,
      [],
      {
        locale: 'umi_locale',
        theme: 'custom_theme',
        searchHistory: 'custom_search',
      },
    );

    expect(await screen.findByText('home:en')).toBeDefined();
    expect(document.querySelector<HTMLElement>('.docs-root')?.dataset['theme']).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Language' }));
    fireEvent.click(screen.getByRole('option', { name: '简体中文' }));
    expect(await screen.findByText('home:zh-CN')).toBeDefined();
    expect(values.get('umi_locale')).toBe('zh-CN');

    fireEvent.click(screen.getByRole('button', { name: '主题' }));
    fireEvent.click(screen.getByRole('option', { name: '亮色' }));
    expect(values.get('custom_theme')).toBe('light');
  });

  it('omits API navigation when API is not configured', async () => {
    window.history.replaceState({}, '', '/en/');
    renderSite('/', '/', false);

    expect(await screen.findByText('home:en')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'API' })).toBeNull();
  });

  it('omits disabled manual routes and navigation without requesting manual data', async () => {
    const fetcher = vi.fn();

    vi.stubGlobal('fetch', fetcher);
    window.history.replaceState({}, '', '/en/manual');
    renderSite('/', '/', false, undefined, [], undefined, false);

    expect(await screen.findByRole('heading', { name: /Page not found/u })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Manual' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Search docs' })).toBeNull();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('omits disabled manuals from the API page switcher', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      schemaVersion: 2, defaultVersion: 'current', packages: [],
    })));
    window.history.replaceState({}, '', '/en/api');
    renderSite('/', '/', true, undefined, [], undefined, false);

    expect(await screen.findByText('Page not found')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Switch page' }));
    expect(screen.queryByRole('menuitem', { name: 'Manual' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'API' })).toBeDefined();
  });

  it.each(['/', '/docs/'])('links the menu and brand to the deployment root %s', async base => {
    window.history.replaceState({}, '', base + 'en/');
    const { container } = renderSite(base, base, false);

    await screen.findByText('home:en');
    const homeLinks = screen.getAllByRole('link', { name: 'Home', hidden: true });

    expect(homeLinks).toHaveLength(2);
    for (const link of [...homeLinks, ...container.querySelectorAll('.site-brand')]) {
      expect(link.getAttribute('href')).toBe(base);
    }
  });

  it.each(['en/missing', 'missing'])('returns from 404 at %s to the deployment root', async path => {
    window.history.replaceState({}, '', '/docs/' + path);
    renderSite('/docs/', '/docs/', false);

    const backHome = await screen.findByRole('link', { name: /Back to home|返回首页/u });

    expect(backHome.getAttribute('href')).toBe('/docs/');
    fireEvent.click(backHome);
    expect(await screen.findByText('home:zh-CN')).toBeDefined();
  });

  it('renders registered pages in the shared shell with localized titles', async () => {
    window.history.replaceState({}, '', '/en/custom-page/');
    renderSite('/', '/', false, undefined, [
      {
        slug: 'custom-page',
        title: { en: 'Custom page', 'zh-CN': '自定义页面' },
        render: locale => (
          <h1>{locale === 'en' ? 'Custom page' : '自定义页面'}</h1>
        ),
      },
    ]);

    expect(await screen.findByRole('heading', { name: 'Custom page' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Custom page' })).toBeDefined();
    expect(document.title).toBe('Custom page | Shared docs');
  });

  it('includes registered business pages in the docs page switcher menu', async () => {
    window.history.replaceState({}, '', '/en/manual');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('navigation.json')
          ? Response.json([])
          : new Response('# Manual introduction', { status: 200 }),
      ),
    );
    renderSite('/', '/', false, undefined, [
      {
        slug: 'custom-page',
        title: { en: 'Custom page', 'zh-CN': '自定义页面' },
        icon: 'source',
        render: locale => (
          <h1>{locale === 'en' ? 'Custom page' : '自定义页面'}</h1>
        ),
      },
    ]);

    expect(await screen.findByRole('heading', { name: 'Manual introduction' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Switch page' }));

    const customPageItem = screen.getByRole('menuitem', { name: 'Custom page' });

    expect(customPageItem.getAttribute('href')).toBe('/en/custom-page/');
    expect(customPageItem.querySelector('svg')?.getAttribute('data-icon')).toBe(
      'source',
    );
  });

  it('loads manual data from a base separate from the route basename', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      return url.endsWith('navigation.json')
        ? Response.json([])
        : new Response('# Manual introduction', { status: 200 });
    });

    vi.stubGlobal('fetch', fetcher);
    window.history.replaceState({}, '', '/pub/docs/en/manual');
    renderSite('/pub/docs/', '/pub/');

    expect(
      await screen.findByRole('heading', { name: 'Manual introduction' }),
    ).toBeDefined();
    expect(fetcher).toHaveBeenCalledWith('/pub/data/manual/navigation.json');
    expect(fetcher).toHaveBeenCalledWith('/pub/data/manual/en/index.md');
  });

  it('loads manual data from the configured published URL', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      return url.endsWith('navigation.json')
        ? Response.json([])
        : new Response('# Manual introduction', { status: 200 });
    });

    vi.stubGlobal('fetch', fetcher);
    window.history.replaceState({}, '', '/pub/docs/en/manual');
    renderSite('/pub/docs/', '/pub/', true, '/assets/manual-content/');

    expect(
      await screen.findByRole('heading', { name: 'Manual introduction' }),
    ).toBeDefined();
    expect(fetcher).toHaveBeenCalledWith(
      '/assets/manual-content/navigation.json',
    );
    expect(fetcher).toHaveBeenCalledWith('/assets/manual-content/en/index.md');
  });

  it('redirects the locale root while preserving query and hash', async () => {
    window.history.replaceState({}, '', '/?mode=all#intro');

    renderSite();

    expect(await screen.findByText('home:zh-CN')).toBeDefined();
    expect(screen.getByText('/zh-CN/?mode=all#intro')).toBeDefined();
  });

  it('routes localized API paths through configured shared API route', async () => {
    window.history.replaceState({}, '', '/en/api/example');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          schemaVersion: 2,
          defaultVersion: 'current',
          packages: [],
        }),
      ),
    );

    renderSite();

    expect(screen.getByRole('link', { name: /Shared docs/u })).toBeDefined();
    expect(await screen.findByText('Page not found')).toBeDefined();
  });

  it('reuses the manifest client when navigating between API route patterns', async () => {
    const baseURL = '/api-cache-test/';
    const fetcher = vi.fn(async () =>
      Response.json({
        schemaVersion: 2,
        defaultVersion: 'current',
        packages: [],
      }),
    );

    vi.stubGlobal('fetch', fetcher);
    window.history.replaceState({}, '', `${baseURL}en/api/example`);
    renderSite(baseURL);

    expect(await screen.findByText('Page not found')).toBeDefined();
    const apiLink = screen
      .getAllByRole('link')
      .find(link => link.textContent?.trim() === 'API');

    if (apiLink === undefined) {
      throw new Error('Missing API navigation link');
    }
    fireEvent.click(apiLink);
    expect(await screen.findByText('Page not found')).toBeDefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    ['RootWidget', ''],
    ['WebWidget', '?entry=web'],
  ])('opens the deep link for %s when the root entry is listed second', async (name, query) => {
    const entries = ['web', 'root'].map((key, i) => ({
      key, id: i + 1, source: 'src/' + key + '.ts', types: key + '.d.ts',
      symbols: [{ name: key === 'root' ? 'RootWidget' : 'WebWidget', id: i + 3, kind: 256 }],
    }));
    const version = {
      version: '1.0.0', snapshot: 'a'.repeat(64), commit: 'abc', entries,
      json: { en: 'api/example/en.json' },
    };
    const pkg = {
      name: 'Example', key: 'example', entries, latestVersion: version.version, versions: [version],
      current: { ...version, version: 'current', packageVersion: version.version },
    };
    const project = {
      id: 0, name: 'Example', kind: 1, variant: 'project', schemaVersion: '2.0', flags: {},
      symbolIdMap: {}, files: { entries: {}, reflections: {} }, locale: 'en',
      apiSnapshot: { commit: version.commit, packages: [{ ...pkg, version: version.version }] },
      children: entries.flatMap(entry => entry.symbols.map(symbol => ({ ...symbol, variant: 'declaration', flags: {} }))),
    };

    vi.stubGlobal('fetch', async (url: string) => Response.json(url.endsWith('manifest.json')
      ? { schemaVersion: 2, defaultVersion: 'current', packages: [pkg] }
      : project));
    window.history.replaceState({}, '', '/en/api/example/current/' + name + '/' + query);
    renderSite();

    expect(await screen.findByRole('heading', { name })).toBeDefined();
  });
});

it('updates custom page metadata on navigation and normalizes canonical URLs', async () => {
  window.history.replaceState({}, '', '/docs/en/about?tab=preview');
  const alternate = document.createElement('link');

  alternate.rel = 'alternate';
  alternate.hreflang = 'fr';
  alternate.href = 'https://example.test/fr/about/';
  document.head.append(alternate);
  renderSite('/docs/', '/docs/', false, undefined, [
    {
      slug: 'about', title: { en: 'About', 'zh-CN': '关于' },
      seo: { description: { en: 'About this example project.' } },
      render: () => <Link to="/en/next">Next page</Link>,
    },
    { slug: 'next', title: { en: 'Next', 'zh-CN': '下一页' }, render: () => <h1>Next page</h1> },
  ]);

  await waitFor(() => expect(document.title).toBe('About | Shared docs'));
  expect(document.querySelector('meta[name="description"]')?.getAttribute('content'))
    .toBe('About this example project.');
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href'))
    .toBe(`${window.location.origin}/docs/en/about/`);
  expect(document.querySelector('link[hreflang="fr"]')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Next page' }));
  await screen.findByRole('heading', { name: 'Next page' });
  expect(document.title).toBe('Next | Shared docs');
  expect(document.querySelector('meta[name="description"]')?.getAttribute('content'))
    .toBe('Documentation and reference for Next.');
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href'))
    .toBe(`${window.location.origin}/docs/en/next/`);
});

it('uses custom section paths with a router basename and preserves locale navigation', async () => {
  window.history.replaceState({}, '', '/docs/help/en/');
  renderSite('/docs/', '/docs/', false, undefined, [], undefined, true,
    { home: '/help/:locale/', manual: '/help/:locale/guides/', api: '/reference/:locale/' });

  expect(await screen.findByText('home:en')).toBeDefined();
  const links = screen.getAllByRole('link', { name: 'Manual', hidden: true });

  expect(links[0]?.getAttribute('href')).toBe('/docs/help/en/guides/');
  fireEvent.click(screen.getByRole('button', { name: 'Language' }));
  fireEvent.click(screen.getByRole('option', { name: '简体中文' }));
  expect(await screen.findByText('home:zh-CN')).toBeDefined();
  expect(window.location.pathname).toBe('/docs/help/zh-CN/');
});
