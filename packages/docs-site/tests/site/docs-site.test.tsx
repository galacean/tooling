// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocation } from 'react-router-dom';
import { commonMessages, DocsSite } from '@galacean/docs-site';

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
) {
  return render(
    <DocsSite
      baseURL={baseURL}
      dataBaseURL={dataBaseURL}
      locales={locales}
      defaultLocale="zh-CN"
      preferenceNamespace="docs-site-test"
      site={{
        brandLabel: 'Shared docs',
        brandMarkUrls: { light: '/brand-light.svg', dark: '/brand-dark.svg' },
        historyKeyPrefix: 'docs-site-test',
        localeLabels: { en: 'English', 'zh-CN': '简体中文' },
        messages: locale => ({
          ...commonMessages[locale],
          manualIntro: 'Manual introduction',
        }),
        manualSectionLabel: 'Documentation',
        ...(manualDataURL === undefined ? {} : { manualDataURL }),
        ...(includeAPI
          ? {
              api: {
                sourceLinkTemplate:
                  'https://example.test/blob/{commit}/{path}#L{line}',
                rawAssetURLTemplate: 'https://example.test/raw/{path}{search}',
                symbolCountLabelTemplates: {
                  en: '{count} symbols',
                  'zh-CN': '{count} symbols',
                },
                packageReadmes: {},
              },
            }
          : {}),
      }}
      renderHome={locale => (
        <>
          <p>home:{locale}</p>
          <SiteProbe />
        </>
      )}
    />,
  );
}

beforeEach(() => {
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
  it('omits API navigation when API is not configured', async () => {
    window.history.replaceState({}, '', '/en/');
    renderSite('/', '/', false);

    expect(await screen.findByText('home:en')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'API' })).toBeNull();
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
});
