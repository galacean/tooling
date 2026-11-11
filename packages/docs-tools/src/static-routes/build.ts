import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getAPISymbolRouteSegment,
  isRecord,
  parseAPIManifest,
} from '@galacean/docs-site';
import { assertNoSymlinkPath } from '../config/site-config';
import type { DocsSiteConfig } from '../config/site-config';
import { isManualNavigation } from '../manual/navigation';
import { isSafePathSegment } from '../path-validation';
import { readJSON } from '../api/read-json';

interface StaticRoute {
  locale: string;
  relativePath: string;
}

interface StaticRouteOptions {
  base?: string;
  origin?: string;
}

function errorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
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

function escapeHTML(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
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
  config: DocsSiteConfig,
  { base: baseValue, origin }: StaticRouteOptions = {},
): Promise<{ routes: number; bytes: number; base: string }> {
  if (config.siteName === undefined) {
    throw new Error('siteName is required to build static routes');
  }
  const base = normalizeBase(baseValue);
  const dist = path.join(config.repositoryRoot, 'site/dist');
  const dataRoot = path.dirname(config.apiDirectory);
  const manifestPath = path.join(config.apiDirectory, 'manifest.json');
  const navigationPath = path.join(dataRoot, 'manual/navigation.json');

  await assertNoSymlinkPath(config.repositoryRoot, dist);
  await assertNoSymlinkPath(config.repositoryRoot, manifestPath);
  await assertNoSymlinkPath(config.repositoryRoot, navigationPath);
  const manifest = parseAPIManifest(await readJSON(manifestPath));
  const navigationValue: unknown = await readJSON(navigationPath);

  if (!isManualNavigation(navigationValue)) {
    throw new Error('Invalid manual navigation');
  }
  const template = await readFile(path.join(dist, 'index.html'), 'utf8');
  const routes = new Map<string, StaticRoute>();
  const diskPaths = new Map<string, string>();

  function add(locale: string, segments: string[] = []): void {
    const route = `/${[locale, ...segments].map(encodeURIComponent).join('/')}/`;
    const relativePath = [locale, ...segments].join('/');
    const folded = relativePath.toLocaleLowerCase('en-US');

    if (segments.some(segment => !isSafePathSegment(segment))) {
      throw new Error(`Unsafe static route: ${route}`);
    }
    if (diskPaths.has(folded) && diskPaths.get(folded) !== relativePath) {
      throw new Error(`Case-insensitive static route collision: ${route}`);
    }
    diskPaths.set(folded, relativePath);
    routes.set(route, { locale, relativePath });
  }

  for (const locale of config.locales) {
    add(locale);
    for (const section of ['api', 'manual']) {
      add(locale, [section]);
    }
    for (const manual of navigationValue) {
      add(locale, ['manual', manual.slug]);
    }
    for (const pkg of manifest.packages) {
      add(locale, ['api', pkg.key]);
      for (const version of [pkg.current, ...pkg.versions]) {
        for (const entry of version.entries) {
          for (const symbol of entry.symbols) {
            add(locale, [
              'api',
              pkg.key,
              version.version,
              getAPISymbolRouteSegment(entry.symbols, symbol.name),
            ]);
          }
        }
      }
    }
  }

  for (const [route, info] of routes) {
    const directory = path.join(dist, info.relativePath);
    const canonical =
      origin === undefined
        ? ''
        : `<link rel="canonical" href="${escapeHTML(
            new URL(`${base}${route.slice(1)}`, origin).href,
          )}" />`;
    const routeSuffix = info.relativePath
      .split('/')
      .slice(1)
      .map(encodeURIComponent)
      .join('/');
    const alternates = config.locales
      .map(locale => {
        const localizedPath = `${base}${encodeURIComponent(locale)}/${routeSuffix.length === 0 ? '' : `${routeSuffix}/`}`;
        const href =
          origin === undefined
            ? localizedPath
            : new URL(localizedPath, origin).href;

        return `<link rel="alternate" hreflang="${escapeHTML(locale)}" href="${escapeHTML(href)}" />`;
      })
      .join('');
    const html = template
      .replace('lang="zh-CN"', `lang="${escapeHTML(info.locale)}"`)
      .replace('</head>', `${canonical}${alternates}</head>`);

    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), html);
  }
  const home = `${base}${config.locales[0] ?? config.sourceLocale}/`;

  await writeFile(
    path.join(dist, '404.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>404 · ${escapeHTML(config.siteName)}</title>
  <link rel="icon" href="${base}favicon.svg"></head><body style="font-family:system-ui;padding:48px">
  <h1>404 · Page not found</h1><p><a href="${home}">Home</a></p></body></html>\n`,
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
    for (const manual of navigationValue) {
      const format = manual.format?.[locale] ?? 'markdown';
      const extension = format === 'html' ? 'html' : 'md';
      const contentPath = path.join(
        dataRoot,
        'manual',
        locale,
        `${manual.slug}.${extension}`,
      );
      const content = await readFile(contentPath, 'utf8');
      const targets =
        format === 'html'
          ? [...content.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/giu)].map(
              match => match[1],
            )
          : [...content.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/gu)].map(
              match => match[1],
            );

      for (const target of targets) {
        if (
          target === undefined ||
          /^(?:https?:|mailto:|tel:|data:|\/\/)/iu.test(target)
        ) {
          continue;
        }
        const url = new URL(
          target,
          `https://local.invalid/${locale}/manual/${manual.slug}/`,
        );

        if (routes.has(url.pathname)) {
          continue;
        }
        const manualPrefix = `/${locale}/manual/`;

        if (
          !/\.(?:png|jpe?g|gif|webp|svg|pdf|mp4|webm|zip)$/iu.test(
            url.pathname,
          ) ||
          !url.pathname.startsWith(manualPrefix)
        ) {
          throw new Error(
            `Invalid manual link: ${locale}/${manual.slug} -> ${target}`,
          );
        }
        const assetSegments = url.pathname
          .slice(manualPrefix.length)
          .split('/')
          .map(decodeURIComponent);
        const assetPath = path.resolve(
          dataRoot,
          'manual',
          locale,
          ...assetSegments,
        );

        if (
          assetSegments.some(segment => !isSafePathSegment(segment)) ||
          !isWithin(path.join(dataRoot, 'manual', locale), assetPath)
        ) {
          throw new Error(
            `Unsafe manual asset link: ${locale}/${manual.slug} -> ${target}`,
          );
        }
        await assertNoSymlinkPath(config.repositoryRoot, assetPath);
        let metadata;

        try {
          metadata = await stat(assetPath);
        } catch (error) {
          if (errorCode(error) === 'ENOENT') {
            throw new Error(
              `Manual asset does not exist: ${locale}/${manual.slug} -> ${target}`,
              { cause: error },
            );
          }
          throw error;
        }
        if (!metadata.isFile()) {
          throw new Error(
            `Manual asset is not a file: ${locale}/${manual.slug} -> ${target}`,
          );
        }
      }
    }
  }
  for (const match of template.matchAll(/(?:src|href)="([^"#]+)"/gu)) {
    const resource = match[1];

    if (resource === undefined || /^https?:\/\//u.test(resource)) {
      continue;
    }
    if (!resource.startsWith(base)) {
      throw new Error(`Resource is outside site base ${base}: ${resource}`);
    }
    await stat(path.join(dist, resource.slice(base.length)));
  }
  const bytes = await directoryBytes(dist);

  if (routes.size > 10000 || bytes > 500 * 1024 * 1024) {
    throw new Error(
      `Static site artifact too large: ${routes.size} routes, ${bytes} bytes`,
    );
  }

  return { routes: routes.size, bytes, base };
}
