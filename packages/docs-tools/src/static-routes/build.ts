import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  localePath,
  isRecord,
  parseAPIManifest,
} from '@galacean/docs-site';
import { assertNoSymlinkPath, isWithin } from '../path-validation';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { isManualNavigation } from '../manual/navigation';
import { readJSON } from '../api/read-json';
import { collectStaticRoutes } from './collect-routes';
import { copyManualAssets } from './copy-manual-assets';
import { escapeHTML, parseRouteTemplate } from './assemble-page';

interface StaticRouteOptions {
  base?: string;
  origin?: string;
}

function isSearchLinkArray(value: unknown): value is { url: string }[] {
  return (
    Array.isArray(value) &&
    value.every(item => isRecord(item) && typeof item['url'] === 'string')
  );
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

async function directoryBytes(directory: string): Promise<number> {
  let bytes = 0;

  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);

      if (entry.isSymbolicLink()) {
        throw new Error(`Symlink in static site artifact: ${filename}`);
      }
      if (entry.isDirectory()) {
        await visit(filename);
      } else {
        const metadata = await stat(filename);

        if (metadata.nlink > 1) {
          throw new Error(`Hard link in static site artifact: ${filename}`);
        }
        bytes += metadata.size;
      }
    }
  }

  await visit(directory);

  return bytes;
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
  const template = parseRouteTemplate(await readFile(path.join(dist, 'index.html'), 'utf8'));
  const routes = collectStaticRoutes(config, config.siteName, navigationValue, apiPackages);
  const defaultHome = localePath(config.defaultLocale ?? config.sourceLocale);
  const sitemap: string[] = [];
  const routeHref = (route: string) => {
    const pathname = `${base}${route.slice(1)}`;

    return origin === undefined ? pathname : new URL(pathname, origin).href;
  };

  for (const [pathname, page] of routes) {
    const directory = path.join(dist, page.locale, ...page.segments);
    const canonical = origin === undefined ? undefined : routeHref(pathname);
    const alternates = config.locales.map(locale => ({ locale, href: routeHref(localePath(locale, page.segments)) }));
    const html = template.render(page, canonical, alternates);

    if (page.includeInSitemap && canonical !== undefined) {
      sitemap.push(canonical);
    }
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
  const homeHref = config.homeHref ?? '/';
  const home = /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(homeHref)
    ? homeHref
    : `${base}${homeHref.replace(/^\//u, '')}`;

  await writeFile(
    path.join(dist, '404.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
  <title>404 · ${escapeHTML(config.siteName)}</title>
  <link rel="icon" href="${escapeHTML(base)}favicon.svg"></head><body style="font-family:system-ui;padding:48px">
  <h1>404 · Page not found</h1><p><a href="${escapeHTML(home)}">Home</a></p></body></html>\n`,
  );
  await writeFile(path.join(dist, '.nojekyll'), '');
  await writeFile(
    path.join(dist, 'routes.json'),
    `${JSON.stringify([...routes.keys()])}\n`,
  );

  for (const locale of config.locales) {
    const searchPath = path.join(dataRoot, 'search', `${locale}.json`);
    const search: unknown = await readJSON(searchPath);

    if (!isSearchLinkArray(search)) {
      throw new Error(`Invalid search index: ${locale}`);
    }
    for (const result of search) {
      const url = new URL(result.url, 'https://local.invalid');

      if (!routes.has(url.pathname)) {
        throw new Error(`Search route has no static entry: ${result.url}`);
      }
    }
    await copyManualAssets(config, locale, navigationValue, routes, dist);
  }
  for (const resource of template.resources) {
    if (/^(?:#|[a-z][a-z\d+.-]*:|\/\/)/iu.test(resource)) {
      continue;
    }
    if (!resource.startsWith(base)) {
      throw new Error(`Resource is outside site base ${base}: ${resource}`);
    }
    const pathname = decodeURIComponent(new URL(resource, 'https://local.invalid').pathname);
    const filename = path.join(dist, pathname.slice(base.length));

    if (!pathname.startsWith(base) || !isWithin(dist, filename)) {
      throw new Error(`Resource is outside site base ${base}: ${resource}`);
    }
    await stat(filename);
  }
  const bytes = await directoryBytes(dist);

  if (routes.size > 10000 || bytes > 500 * 1024 * 1024) {
    throw new Error(
      `Static site artifact too large: ${routes.size} routes, ${bytes} bytes`,
    );
  }

  return { routes: routes.size, bytes, base };
}
