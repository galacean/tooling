import { describe, expect, it } from 'vitest';
import { createDocsRoutes } from '../../src/routing/paths';

describe('shared documentation route paths', () => {
  it('uses the same custom paths for packages, members, locales and search targets', () => {
    const routes = createDocsRoutes({
      home: '/help/:locale/',
      manual: '/help/:locale/guide/',
      api: '/sdk/:locale/',
    });

    expect(routes.manual('zh-CN', '开始')).toBe('/help/zh-CN/guide/%E5%BC%80%E5%A7%8B/');
    expect(routes.symbol('en', 'engine', 'current', 'Camera', 'web', 'lookAt')).toBe(
      '/sdk/en/engine/current/Camera/?entry=web#lookAt',
    );
    expect(
      routes.switchLocale('/sdk/en/engine/current/Camera/', 'zh-CN', '?entry=web', '#lookAt'),
    ).toBe('/sdk/zh-CN/engine/current/Camera/?entry=web#lookAt');
    expect(routes.path('en', ['manual', 'intro'])).toBe(routes.manual('en', 'intro'));
  });

  it('switches the API locale when the manual uses a locale-only prefix', () => {
    const routes = createDocsRoutes({
      home: '/help/:locale/', manual: '/:locale/', api: '/reference/:locale/',
    });
    const pathname = routes.package('en', 'engine');

    expect(routes.switchLocale(pathname, 'de')).toBe('/reference/de/engine/');
    expect(routes.switchLocale(pathname, 'de', '?entry=web', '#member', 'en'))
      .toBe('/reference/de/engine/?entry=web#member');
    expect(routes.switchLocale('/en/intro/', 'de', '', '', 'en')).toBe('/de/intro/');
  });

  it.each([
    '/help/',
    '/:locale/../',
    '//:locale/',
    '/:locale/:other/',
    '/:locale/?x=1',
    'https://example.com/:locale/',
  ])('rejects invalid route declarations: %s', manual => {
    expect(() => createDocsRoutes({ manual })).toThrow();
  });

  it('allows a standalone manual at the locale root and rejects traversal segments', () => {
    expect(createDocsRoutes({ manual: '/:locale/' }).manual('en', 'intro')).toBe('/en/intro/');
    expect(() => createDocsRoutes().manual('en', '..')).toThrow();
  });
});
