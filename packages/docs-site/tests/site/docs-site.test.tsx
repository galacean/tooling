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

function renderSite(baseURL = '/') {
  return render(
    <DocsSite
      baseURL={baseURL}
      locales={locales}
      defaultLocale="zh-CN"
      preferenceNamespace="docs-site-test"
      site={{
        brandLabel: 'Shared docs',
        brandMarkUrl: '/brand.svg',
        historyKeyPrefix: 'docs-site-test',
        localeLabels: { en: 'English', 'zh-CN': '简体中文' },
        messages: locale => ({
          ...commonMessages[locale],
          manualIntro: 'Manual introduction',
        }),
        manualSectionLabel: 'Documentation',
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
