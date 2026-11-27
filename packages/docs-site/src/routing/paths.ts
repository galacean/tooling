import { getAPISymbolRouteSegment } from '../data/api-manifest';
import type { APIManifestPackage } from '../data/api-manifest';
import { findAPIVersion } from '../data/api-selection';
import type { DocsTarget } from './targets';

export interface DocsRoutePaths {
  home?: string;
  manual?: string;
  api?: string;
}

const defaults = { home: '/:locale/', manual: '/:locale/manual/', api: '/:locale/api/' };

/** Serializable section paths shared by the runtime, search and static route generation. */
export function createDocsRoutes(paths: DocsRoutePaths = {}) {
  const patterns = { ...defaults, ...paths };

  for (const pattern of Object.values(patterns)) {
    const segments = pattern.split('/').filter(Boolean);

    if (
      !pattern.startsWith('/') ||
      !pattern.endsWith('/') ||
      pattern.includes('//') ||
      segments.filter(segment => segment === ':locale').length !== 1 ||
      segments.some(segment => segment !== ':locale' && !/^[a-zA-Z0-9_-]+$/u.test(segment))
    ) {
      throw new Error(`Invalid documentation route path: ${pattern}`);
    }
  }
  // Try longer section prefixes before a locale-only catch-all.
  const sectionPatterns = Object.values(patterns).sort((a, b) => b.length - a.length);

  function path(locale: string, segments: readonly string[] = [], search = '', hash = ''): string {
    if (
      [locale, ...segments].some(segment => segment === '.' || segment === '..' || segment === '')
    ) {
      throw new Error('Invalid documentation route segment');
    }
    const section = segments[0];
    const pattern =
      section === 'manual' ? patterns.manual : section === 'api' ? patterns.api : patterns.home;
    const suffix = section === 'manual' || section === 'api' ? segments.slice(1) : segments;

    return `${pattern.replace(':locale', encodeURIComponent(locale))}${suffix.length === 0 ? '' : `${suffix.map(encodeURIComponent).join('/')}/`}${search}${hash}`;
  }

  return {
    patterns,
    path,
    manual: (locale: string, slug?: string) =>
      path(locale, slug === undefined ? ['manual'] : ['manual', slug]),
    api: (locale: string) => path(locale, ['api']),
    package: (locale: string, packageKey: string) => path(locale, ['api', packageKey]),
    symbol: (
      locale: string,
      packageKey: string,
      version: string,
      symbol: string,
      entry = 'root',
      hash = '',
    ) =>
      path(
        locale,
        ['api', packageKey, version, symbol],
        entry === 'root' ? '' : `?entry=${encodeURIComponent(entry)}`,
        hash === '' ? '' : `#${encodeURIComponent(hash)}`,
      ),
    switchLocale(pathname: string, locale: string, search = '', hash = '', currentLocale?: string) {
      for (const pattern of sectionPatterns) {
        const expression = new RegExp(`^${pattern.replace(':locale', '([^/]+)')}(.*)$`, 'u');
        const match = expression.exec(pathname.endsWith('/') ? pathname : `${pathname}/`);

        if (match !== null && (currentLocale === undefined || match[1] === currentLocale)) {
          return `${pattern.replace(':locale', encodeURIComponent(locale))}${match[2] ?? ''}${search}${hash}`;
        }
      }

      return path(locale, [], search, hash);
    },
  };
}

export type DocsRoutes = ReturnType<typeof createDocsRoutes>;

export const defaultDocsRoutes = createDocsRoutes();

export function siteTargetHref(
  routes: DocsRoutes,
  target: DocsTarget,
  packages: readonly APIManifestPackage[] = [],
  symbolSegment = getAPISymbolRouteSegment,
): string {
  switch (target.kind) {
    case 'manual':
      return (
        routes.manual(target.locale, target.slug) +
        (target.anchor !== undefined && target.anchor !== '' ? '#' + encodeURIComponent(target.anchor) : '')
      );
    case 'api':
      return routes.api(target.locale);
    case 'package':
      return routes.package(target.locale, target.packageKey);
    case 'symbol': {
      const pkg = packages.find(item => item.key === target.packageKey);
      const version = findAPIVersion(pkg, target.version);
      const symbols = version?.entries.find(item => item.key === target.entryKey)?.symbols;

      return routes.symbol(
        target.locale,
        target.packageKey,
        target.version,
        symbols === undefined ? target.symbol : symbolSegment(symbols, target.symbol),
        target.entryKey,
        target.anchor,
      );
    }
  }
}
