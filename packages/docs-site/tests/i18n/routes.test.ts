import { describe, expect, it } from 'vitest';
import {
  defaultDocsRoutes,
  normalizeBase,
  withBase,
} from '@galacean/docs-site';

describe('shared locale routes', () => {
  it('encodes API package, symbol, entry, and member hash segments', () => {
    expect(defaultDocsRoutes.package('zh-CN', 'example')).toBe('/zh-CN/api/example/');
    expect(
      defaultDocsRoutes.symbol(
        'en',
        'example',
        'current',
        'Widget<T>',
        'browser/file',
        'member name',
      ),
    ).toBe(
      '/en/api/example/current/Widget%3CT%3E/?entry=browser%2Ffile#member%20name',
    );
  });

  it('preserves query/hash while changing locale and normalizes deployment base exactly once', () => {
    expect(
      defaultDocsRoutes.switchLocale(
        '/zh-CN/api/example/current/Widget/',
        'en',
        '?entry=browser',
        '#member',
      ),
    ).toBe('/en/api/example/current/Widget/?entry=browser#member');
    expect(defaultDocsRoutes.path('en')).toBe('/en/');
    expect(withBase('/en/manual/start/', '/design-bridge/')).toBe(
      '/design-bridge/en/manual/start/',
    );
    expect(normalizeBase('/')).toBe('/');
    expect(() => normalizeBase('/design-bridge')).toThrow();
  });
});
