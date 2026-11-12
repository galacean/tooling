import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { convert } from 'html-to-text';
import {
  indexReflections,
  getAPISymbolRouteSegment,
  isRecord,
  parseAPIManifest,
  parseProject,
} from '@galacean/docs-site';
import type { APIManifest, SearchResult } from '@galacean/docs-site';
import { assertNoSymlinkPath } from '../config/site-config';
import type { DocsSiteConfig } from '../config/site-config';
import { readJSON } from '../api/read-json';
import { readAPISnapshot } from '../api/snapshot-reference';
import { isManualNavigation } from '../manual/navigation';
import type { ManualNavigationItem } from '../manual/navigation';
import { isSafePathSegment } from '../path-validation';
import { hasPackageReadme, readPackageReadme } from '../package-readmes/read';

function errorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

function typeKeywords(value: unknown): string[] {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' ? [value] : [];
  }

  return Object.values(value).flatMap(typeKeywords);
}

function searchableMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]+\)/gu, '$1')
    .replace(/[#>*`~_]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function commentText(
  reflection: Record<string, unknown>,
  sourceLocale: string,
) {
  let comment = reflection['comment'];

  if (!isRecord(comment)) {
    const signatures = reflection['signatures'];
    const first: unknown = Array.isArray(signatures)
      ? (signatures[0] as unknown)
      : undefined;

    comment = isRecord(first) ? first['comment'] : undefined;
  }
  const summary =
    isRecord(comment) && Array.isArray(comment['summary'])
      ? comment['summary']
          .filter(isRecord)
          .map(part => (typeof part['text'] === 'string' ? part['text'] : ''))
          .join('')
      : '';

  return {
    summary,
    sourceLocale:
      isRecord(comment) && typeof comment['sourceLocale'] === 'string'
        ? comment['sourceLocale']
        : sourceLocale,
  };
}

async function buildAPIResults(
  config: DocsSiteConfig,
  manifest: APIManifest,
  locale: string,
): Promise<SearchResult[]> {
  const dataRoot = path.dirname(config.apiDirectory);
  const results: SearchResult[] = [];

  for (const pkg of manifest.packages) {
    if (!isSafePathSegment(pkg.key)) {
      throw new Error(`Unsafe API package key in manifest: ${pkg.key}`);
    }
    const snapshotPath = pkg.current.json[locale];

    if (snapshotPath === undefined) {
      throw new Error(
        `Missing current API snapshot path: ${pkg.key}/${locale}`,
      );
    }
    const snapshot: unknown = (
      await readAPISnapshot(
        path.resolve(dataRoot, snapshotPath),
        dataRoot,
        config.repositoryRoot,
      )
    ).value;

    if (!isRecord(snapshot) || snapshot['locale'] !== locale) {
      throw new Error(`Invalid current API snapshot: ${pkg.key}/${locale}`);
    }
    const project = parseProject<Record<string, unknown>>(
      snapshot,
      candidate =>
        typeof candidate === 'string' && config.locales.includes(candidate),
    );
    const reflections = indexReflections(project);

    for (const entry of pkg.current.entries) {
      for (const symbol of entry.symbols) {
        const reflection = reflections.get(symbol.id);

        if (!isRecord(reflection)) {
          throw new Error(
            `Missing API reflection: ${pkg.key}/${symbol.name}/${locale}`,
          );
        }
        const route = `/${locale}/api/${pkg.key}/current/${encodeURIComponent(
          getAPISymbolRouteSegment(entry.symbols, symbol.name),
        )}/`;
        const query =
          entry.key === 'root' ? '' : `?entry=${encodeURIComponent(entry.key)}`;
        const add = (
          name: string,
          target: Record<string, unknown>,
          hash = '',
        ) => {
          const comment = commentText(target, config.sourceLocale);

          results.push({
            category: 'api',
            name,
            pkg: pkg.name,
            version: 'current',
            kind: Number(target['kind']),
            summary: comment.summary,
            sourceLocale: comment.sourceLocale,
            keywords: typeKeywords(target['type']).join(' '),
            url: `${route}${query}${hash}`,
          });
        };

        add(symbol.name, reflection);
        const members = reflection['children'];

        if (Array.isArray(members)) {
          for (const member of members) {
            if (isRecord(member) && typeof member['name'] === 'string') {
              add(
                member['name'],
                member,
                `#${encodeURIComponent(member['name'])}`,
              );
            }
          }
        }
      }
    }
  }

  return results;
}

async function buildReadmeResults(
  config: DocsSiteConfig,
  manifest: APIManifest,
  locale: string,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  for (const pkg of manifest.packages) {
    if (!isSafePathSegment(pkg.key)) {
      throw new Error(`Unsafe API package key in manifest: ${pkg.key}`);
    }
    if (!hasPackageReadme(config, pkg.key)) {
      continue;
    }
    const { text: readme, sourceLocale } = await readPackageReadme(
      config,
      pkg.key,
      locale,
    );
    const title = /^# (.+)$/mu.exec(readme)?.[1];

    if (title === undefined || readme.trim() === '') {
      throw new Error(`Missing package README content: ${pkg.key}/${locale}`);
    }
    results.push({
      category: 'api',
      name: pkg.name,
      pkg: pkg.name,
      summary: searchableMarkdown(readme).slice(0, 250),
      keywords: readme,
      sourceLocale,
      url: `/${locale}/api/${pkg.key}/`,
    });
  }

  return results;
}

async function buildManualResults(
  config: DocsSiteConfig,
  navigation: ManualNavigationItem[],
  locale: string,
): Promise<SearchResult[]> {
  const manualRoot = config.manualDirectory;
  const results: SearchResult[] = [];

  for (const manual of navigation) {
    const format = manual.format?.[locale] ?? 'markdown';
    const extension = format === 'html' ? 'html' : 'md';
    const contentPath = path.join(
      manualRoot,
      locale,
      `${manual.slug}.${extension}`,
    );

    await assertNoSymlinkPath(config.repositoryRoot, contentPath);
    const content = await readFile(contentPath, 'utf8');
    const searchableText =
      format === 'html'
        ? convert(content, { wordwrap: false })
        : searchableMarkdown(content);
    const title =
      format === 'html'
        ? manual.title[locale]
        : /^# (.+)$/mu.exec(content)?.[1];

    if (
      title === undefined ||
      title.trim() === '' ||
      searchableText.trim() === ''
    ) {
      throw new Error(`Missing manual content: ${locale}/${manual.slug}`);
    }
    results.push({
      category: 'manual',
      name: title,
      summary: searchableText.slice(0, 250),
      keywords: searchableText,
      sourceLocale: locale,
      url: `/${locale}/manual/${manual.slug}/`,
    });
  }

  return results;
}

export async function buildSearchIndexes(
  config: DocsSiteConfig,
): Promise<Record<string, number>> {
  const dataRoot = path.dirname(
    config.apiConfigured === false
      ? config.manualDirectory
      : config.apiDirectory,
  );
  const manifestPath = path.join(config.apiDirectory, 'manifest.json');
  const navigationPath = path.join(config.manualDirectory, 'navigation.json');

  await assertNoSymlinkPath(config.repositoryRoot, navigationPath);
  let manifest: APIManifest | undefined;

  if (config.apiConfigured !== false) {
    await assertNoSymlinkPath(config.repositoryRoot, manifestPath);
    try {
      manifest = parseAPIManifest(await readJSON(manifestPath));
    } catch (error) {
      if (errorCode(error) !== 'ENOENT' || config.apiPackages !== undefined) {
        throw error;
      }
    }
  }
  const navigationValue: unknown =
    config.manualConfigured === false ? [] : await readJSON(navigationPath);

  if (!isManualNavigation(navigationValue)) {
    throw new Error('Invalid manual navigation');
  }
  const outputDirectory = path.join(dataRoot, 'search');
  const counts: Record<string, number> = {};

  await assertNoSymlinkPath(config.repositoryRoot, outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  for (const locale of config.locales) {
    const results = [
      ...(manifest === undefined
        ? []
        : await buildAPIResults(config, manifest, locale)),
      ...(manifest === undefined
        ? []
        : await buildReadmeResults(config, manifest, locale)),
      ...(config.manualConfigured === false
        ? []
        : await buildManualResults(config, navigationValue, locale)),
    ];

    await writeFile(
      path.join(outputDirectory, `${locale}.json`),
      `${JSON.stringify(results)}\n`,
    );
    counts[locale] = results.length;
  }

  return counts;
}
