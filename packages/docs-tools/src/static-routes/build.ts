import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createAPISymbolRouteLookup,
  createDocsRoutes,
  getCommonMessages,
  getLocaleDefinition,
  siteTargetHref,
  type DocsTarget,
  parseAPIManifest,
} from '@galacean/docs-site';
import { assertNoSymlinkPath } from '../path-validation';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { isManualNavigation } from '../manual/navigation';
import { readJSON } from '../api/read-json';
import { collectStaticRoutes } from './collect-routes';
import { validateSearchRoutes, validateStaticArtifact } from './validate-artifact';
import { copyManualAssets } from './copy-manual-assets';
import { escapeHTML, parseRouteTemplate } from './assemble-page';

interface StaticRouteOptions {
  base?: string;
  origin?: string;
}

function normalizeBase(value: string | undefined): string {
  const base = value ?? '/';

  if (
    !base.startsWith('/') ||
    base.includes('?') ||
    base.includes('#') ||
    base.includes('\\')
  ) {
    throw new Error(`Invalid static site base path: ${base}`);
  }
  const segments = base.split('/').filter(Boolean);

  if (segments.some(segment => segment === '.' || segment === '..')) {
    throw new Error(`Invalid static site base path: ${base}`);
  }

  return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
}

export async function buildStaticRoutes(
  config: ResolvedDocsBuildConfig,
  { base: baseValue, origin }: StaticRouteOptions = {},
): Promise<{ routes: number; bytes: number; base: string }> {
  if (config.siteName === undefined) {
    throw new Error('siteName is required to build static routes');
  }
  const base = normalizeBase(baseValue);
  const dist = path.join(config.repositoryRoot, 'site/dist');
  const dataRoot = path.dirname(
    config.apiConfigured === false
      ? config.manualDirectory
      : config.apiDirectory,
  );
  const manifestPath = path.join(config.apiDirectory, 'manifest.json');
  const navigationPath = path.join(config.manualDirectory, 'navigation.json');

  await assertNoSymlinkPath(config.repositoryRoot, dist);
  await assertNoSymlinkPath(config.repositoryRoot, navigationPath);
  let apiPackages: ReturnType<typeof parseAPIManifest>['packages'] = [];

  if (config.apiConfigured !== false) {
    await assertNoSymlinkPath(config.repositoryRoot, manifestPath);
    apiPackages = parseAPIManifest(await readJSON(manifestPath)).packages;
  }
  const navigationValue: unknown =
    config.manualConfigured === false ? [] : await readJSON(navigationPath);

  if (!isManualNavigation(navigationValue)) {
    throw new Error('Invalid manual navigation');
  }
  const template = parseRouteTemplate(await readFile(path.join(dist, 'index.html'), 'utf8'), config.i18n);
  const paths = createDocsRoutes(config.routePaths);
  const routes = collectStaticRoutes(config, paths, config.siteName, navigationValue, apiPackages);

  if (routes.size > 10000) {
    const counts = Object.fromEntries(config.locales.map(locale => [locale, [...routes.values()].filter(page => page.locale === locale).length]));

    throw new Error(`Static site artifact too large: ${routes.size} routes; locales ${JSON.stringify(counts)}`);
  }
  const defaultHome = paths.path(config.defaultLocale ?? config.sourceLocale);
  const sitemap: string[] = [];
  const routeHref = (route: string) => {
    const pathname = `${base}${route.slice(1)}`;

    return origin === undefined ? pathname : new URL(pathname, origin).href;
  };

  for (const [pathname, page] of routes) {
    const directory = path.join(dist, ...pathname.split('/').filter(Boolean).map(decodeURIComponent));
    const canonical = origin === undefined ? undefined : routeHref(pathname);
    const alternates = (page.alternateLocales ?? config.locales)
      .filter(locale => routes.has(page.alternatePaths[locale]!))
      .map(locale => ({ locale, href: routeHref(page.alternatePaths[locale]!) }));
    const html = template.render(page, canonical, alternates);

    if (page.includeInSitemap && canonical !== undefined) {
      sitemap.push(canonical);
    }
    await assertNoSymlinkPath(config.repositoryRoot, directory);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), html);
    if (pathname === defaultHome) {
      await writeFile(path.join(dist, 'index.html'), html);
    }
  }
  const sitemapPath = path.join(dist, 'sitemap.xml');
  const robotsPath = path.join(dist, 'robots.txt');

  if (origin !== undefined) {
    await writeFile(sitemapPath, '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      sitemap.map(url => `  <url><loc>${escapeHTML(url)}</loc></url>`).join('\n') + '\n</urlset>\n');
  } else {
    await rm(sitemapPath, { force: true });
  }
  if (base === '/' && origin !== undefined) {
    await writeFile(robotsPath, `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', origin).href}\n`);
  } else {
    await rm(robotsPath, { force: true });
  }
  const errorPage = (locale: string) => {
    const messages = getCommonMessages(locale, config.i18n);

    return `<!doctype html><html lang="${escapeHTML(locale)}" dir="${getLocaleDefinition(locale, config.i18n?.localeDefinitions).direction}"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
  <title>404 · ${escapeHTML(config.siteName!)}</title>
  <link rel="icon" href="${escapeHTML(base)}favicon.svg"></head><body style="font-family:system-ui;padding:48px">
  <h1>404 · ${escapeHTML(messages.notFound)}</h1><p><a href="${escapeHTML(base)}">${escapeHTML(messages.home)}</a></p></body></html>\n`;
  };

  await writeFile(path.join(dist, '404.html'), errorPage(config.defaultLocale ?? config.sourceLocale));
  for (const locale of config.locales) {
    const localeDirectory = path.join(dist, ...paths.path(locale).split('/').filter(Boolean));

    await assertNoSymlinkPath(config.repositoryRoot, localeDirectory);
    await mkdir(localeDirectory, { recursive: true });
    await writeFile(path.join(localeDirectory, '404.html'), errorPage(locale));
  }
  await writeFile(path.join(dist, '.nojekyll'), '');
  await writeFile(
    path.join(dist, 'routes.json'),
    `${JSON.stringify([...routes.keys()])}\n`,
  );

  const symbolRouteSegment = createAPISymbolRouteLookup();
  const searchHref = (target: DocsTarget) => siteTargetHref(paths, target, apiPackages, symbolRouteSegment);

  for (const locale of config.locales) {
    const searchPath = path.join(dataRoot, 'search', `${locale}.json`);
    const search: unknown = await readJSON(searchPath);

    validateSearchRoutes(search, locale, routes, searchHref);
    if (config.manualConfigured !== false) {
      await copyManualAssets(config, paths, locale, navigationValue, routes, dist);
    }
  }
  const bytes = await validateStaticArtifact(dist, base, template.resources, routes.size);

  return { routes: routes.size, bytes, base };
}
