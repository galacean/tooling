import { commonMessages, formatPageDescription, formatPageTitle, getAPISymbolRouteSegment, localePath } from '@galacean/docs-site';
import type { APIManifestPackage } from '@galacean/docs-site';
import type { ResolvedDocsBuildConfig } from '../config/types';
import type { ManualNavigationItem } from '../manual/navigation';
import { isSafePathSegment } from '../path-validation';

export interface StaticRoute {
  locale: string;
  segments: string[];
  title: string;
  description: string;
  includeInSitemap: boolean;
}

export function collectStaticRoutes(
  config: ResolvedDocsBuildConfig,
  siteName: string,
  navigation: ManualNavigationItem[],
  packages: APIManifestPackage[],
): Map<string, StaticRoute> {
  const routes = new Map<string, StaticRoute>();
  const diskPaths = new Set<string>();
  const home = config.pages?.find(page => page.slug === null);

  for (const locale of config.locales) {
    function add(segments: string[], title: string, description?: string, includeInSitemap = true): void {
      const route = localePath(locale, segments);
      const diskPath = [locale, ...segments].join('/').toLocaleLowerCase('en-US');

      if (![locale, ...segments].every(isSafePathSegment)) {
        throw new Error(`Unsafe static route: ${route}`);
      }
      if (diskPaths.has(diskPath) && !routes.has(route)) {
        throw new Error(`Case-insensitive static route collision: ${route}`);
      }
      diskPaths.add(diskPath);
      routes.set(route, {
        locale, segments, title: formatPageTitle(title, siteName),
        description: formatPageDescription(locale, title, description), includeInSitemap,
      });
    }

    add([], siteName, home?.seo?.description?.[locale]);
    for (const page of config.pages ?? []) {
      if (page.slug !== null) {
        add([page.slug], page.title[locale] ?? siteName, page.seo?.description?.[locale]);
      }
    }
    if (config.apiConfigured !== false) {
      add(['api'], 'API');
    }
    if (config.manualConfigured !== false) {
      const { manual } = commonMessages[locale.startsWith('zh') ? 'zh-CN' : 'en'];

      add(['manual'], manual);
      for (const chapter of navigation) {
        add(['manual', chapter.slug], chapter.title[locale] ?? manual);
      }
    }
    for (const pkg of packages) {
      add(['api', pkg.key], pkg.name);
      for (const version of [pkg.current, ...pkg.versions]) {
        for (const entry of version.entries) {
          for (const symbol of entry.symbols) {
            const segment = getAPISymbolRouteSegment(entry.symbols, symbol.name);

            add(['api', pkg.key, version.version, segment], symbol.name, undefined, false);
          }
        }
      }
    }
  }

  return routes;
}
