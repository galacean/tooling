import { describe, expect, it } from 'vitest';
import { commonMessages } from '../../src/i18n/messages';
import { resolveDocsSiteOptions } from '../../src/config/resolve';
import type { DocsSiteOptions } from '../../src/config/types';

const options: DocsSiteOptions<'en'> = {
  baseURL: '/docs/',
  locales: ['en'],
  defaultLocale: 'en',
  brandLabel: 'Example',
  brandMarkURLs: { light: '/light.svg', dark: '/dark.svg' },
  localeLabels: { en: 'English' },
  messages: () => ({ ...commonMessages.en, manualIntro: 'Introduction' }),
  manual: true,
  siteOrigin: 'https://example.com',
};

describe('site options resolution', () => {
  it.each(['https://cdn.example.com/docs', 'https://cdn.example.com/docs/'])(
    'uses one normalized data prefix for manual and search: %s',
    dataBaseURL => {
      const resolved = resolveDocsSiteOptions({ ...options, dataBaseURL }, 'https://example.com');

      expect(resolved.dataBaseURL).toBe('https://cdn.example.com/docs/');
      expect(resolved.manual).toEqual({ dataURL: 'https://cdn.example.com/docs/data/manual/' });
      expect(resolved.getSearchDataURL('en')).toBe('https://cdn.example.com/docs/data/search/en.json');
      expect(resolved.baseURL).toBe('/docs/');
    },
  );

  it('resolves independent manual URLs and partial storage overrides', () => {
    const resolved = resolveDocsSiteOptions({
      ...options,
      manual: { dataURL: '/content/manual' },
      storageKeys: { locale: 'app_locale' },
    }, 'https://example.com');

    expect(resolved.manual).toEqual({ dataURL: '/content/manual/' });
    expect(resolved.storageKeys).toEqual({ locale: 'app_locale', theme: 'theme', searchHistory: 'search-history' });
    expect(resolved.docsBrandMarkURLs).toEqual(options.brandMarkURLs);
    expect(resolveDocsSiteOptions({ ...options, manual: false }, 'https://example.com').manual).toBe(false);
  });
});

it('rejects conflicting enabled routes when assembling a complete site', () => {
  expect(() => resolveDocsSiteOptions({ ...options, routePaths: { manual: '/:locale/' } }, 'https://example.com')).toThrow(/distinct/u);
});
