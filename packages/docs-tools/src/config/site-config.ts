import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DocsSitePageConfig } from '@galacean/docs-site';
import { readJSON } from '../api/read-json';
import { parseAPIVersionManifest } from '../api/versions';
import type { APIVersionManifest } from '../api/versions';
import { validateAPIConfig } from './api-config-validation';
import { validateManualCollections } from './manual-config-validation';
import { isSafePathSegment } from '../path-validation';

export interface DocsSiteConfig {
  repositoryRoot: string;
  configPath: string;
  sourceLocale: string;
  locales: string[];
  apiDirectory: string;
  apiVersions?: APIVersionManifest;
  apiConfigured?: boolean;
  manualDirectory: string;
  manualConfigured?: boolean;
  translationDirectory?: string;
  apiTranslationDirectory?: string;
  translationCacheDirectory?: string;
  cdnBaseUrl?: string;
  siteName?: string;
  pages?: SitePageConfig[];
  apiPackages?: APIPackageConfig[];
  manuals?: ManualCollectionConfig[];
  typedocOptions?: Record<string, unknown>;
  sourceLinkTemplate?: string;
}

export interface APIEntryConfig {
  key: string;
  source: string;
  types: string;
}

export type SitePageConfig = DocsSitePageConfig<string, string>;

export interface APIReadmeConfig {
  sourceLocale?: string;
  files: Record<string, string>;
}

export interface APIPackageConfig {
  key: string;
  name: string;
  directory: string;
  tsconfig: string;
  entries: APIEntryConfig[];
  readme?: APIReadmeConfig;
}

export interface ManualDocumentConfig {
  namespace: string;
  slug: string;
  routeSlug: string;
  group?: string;
  docId?: string;
}

export interface ManualCollectionConfig {
  key: string;
  routePrefix?: string;
  source:
    | { type: 'local'; directory: string; locale: string }
    | {
        type: 'yuque';
        mode: 'repo';
        baseURL: string;
        namespace: string;
        tokenEnv: string;
        locale: string;
      }
    | {
        type: 'yuque';
        mode: 'documents';
        baseURL: string;
        tokenEnv: string;
        locale: string;
        documents: ManualDocumentConfig[];
      };
  ignore?: {
    docIds?: string[];
    slugs?: string[];
    documentRefs?: { namespace: string; slug: string }[];
    titleContains?: string[];
  };
}

interface SiteConfigInput {
  api?: {
    dataDirectory: string;
    repository?: unknown;
    versions?: unknown;
    generation?: { scope?: unknown };
    packages?: APIPackageConfig[];
    typedocOptions?: Record<string, unknown>;
    sourceLinkTemplate?: string;
  };
  manual?: { dataDirectory: string; collections?: unknown[] };
  pages?: unknown;
  sourceLocale: string;
  locales: string[];
  translationDirectory?: string;
  cdn?: { baseUrl?: unknown };
  siteName?: string;
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function errorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLocaleTag(value: string): boolean {
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(value);
}

function parseSitePages(
  value: unknown,
  locales: string[],
): { pages: SitePageConfig[]; issues: string[] } {
  if (value === undefined) {
    return { pages: [], issues: [] };
  }
  if (!Array.isArray(value)) {
    return { pages: [], issues: ['pages must be an array'] };
  }

  const issues: string[] = [];
  const pages: SitePageConfig[] = [];
  const slugs = new Set(['api', 'manual']);

  for (const [index, page] of value.entries()) {
    if (!isRecord(page)) {
      issues.push(`pages[${index}] must be an object`);
      continue;
    }

    const slug = page['slug'];
    const title = page['title'];
    const icon = page['icon'];

    if (slug === null) {
      if (pages.some(page => page.slug === null)) {
        issues.push('pages must not contain more than one home page');
        continue;
      }
    } else if (typeof slug !== 'string' || !isSafePathSegment(slug)) {
      issues.push(`pages[${index}].slug must be null or a safe path segment`);
      continue;
    } else if (slugs.has(slug)) {
      issues.push(`pages[${index}].slug conflicts with another site route: ${slug}`);
    }
    if (typeof slug === 'string') {
      slugs.add(slug);
    }
    if (slug !== null && !isRecord(title)) {
      issues.push(`pages[${index}].title must be an object`);
      continue;
    }
    if (icon !== undefined && typeof icon !== 'string') {
      issues.push(`pages[${index}].icon must be a string`);
      continue;
    }

    const localizedTitles: Record<string, string> = {};

    if (slug !== null && isRecord(title)) {
      for (const locale of locales) {
        const localizedTitle = title[locale];

        if (typeof localizedTitle !== 'string' || localizedTitle.trim() === '') {
          issues.push(`pages[${index}].title.${locale} must be a non-empty string`);
        } else {
          localizedTitles[locale] = localizedTitle;
        }
      }
    }
    pages.push(
      slug === null
        ? { slug, ...(icon === undefined ? {} : { icon }) }
        : {
            slug,
            title: localizedTitles,
            ...(icon === undefined ? {} : { icon }),
          },
    );
  }

  return { pages, issues };
}

export async function assertNoSymlinkPath(
  rootPath: string,
  targetPath: string,
): Promise<void> {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);

  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Path must stay inside the repository root: ${target}`);
  }
  let current = root;

  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Symlink paths are not allowed: ${current}`);
      }
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return;
      }
      throw error;
    }
  }
}

export async function loadSiteConfig(
  configPath: string,
  repositoryRoot: string,
): Promise<DocsSiteConfig> {
  const root = await realpath(repositoryRoot);
  const filename = path.resolve(root, configPath);

  if (!isWithin(root, filename) || filename === root) {
    throw new Error('Config path must stay inside the repository root');
  }
  await assertNoSymlinkPath(root, filename);
  const extension = path.extname(filename);
  let loaded: unknown;

  if (extension === '.json') {
    loaded = await readJSON(filename);
  } else if (['.ts', '.mts', '.cts'].includes(extension)) {
    const { tsImport } = await import('tsx/esm/api');

    loaded = await tsImport(pathToFileURL(filename).href, import.meta.url);
  } else {
    loaded = await import(pathToFileURL(filename).href);
  }
  let config: unknown =
    isRecord(loaded) && 'default' in loaded ? loaded['default'] : loaded;

  while (
    isRecord(config) &&
    Object.keys(config).length === 1 &&
    'default' in config
  ) {
    config = config['default'];
  }
  const issues: string[] = [];
  let pages: SitePageConfig[] | undefined;

  if (!isRecord(config)) {
    issues.push('expected an object export');
  } else {
    const api = config['api'];
    const manual = config['manual'];
    const locales = config['locales'];
    const sourceLocale = config['sourceLocale'];

    if (config['packageReadmes'] !== undefined) {
      issues.push(
        'packageReadmes must be configured under api.packages[].readme.files',
      );
    }
    if (config['packageReadmeSourceLocales'] !== undefined) {
      issues.push(
        'packageReadmeSourceLocales must be configured as api.packages[].readme.sourceLocale',
      );
    }
    if (config['manuals'] !== undefined) {
      issues.push(
        'manual collections must be configured under manual.collections',
      );
    }
    issues.push(...validateAPIConfig(api, locales, sourceLocale));
    if (isRecord(api) && api['generation'] !== undefined) {
      if (
        !isRecord(api['generation']) ||
        api['generation']['scope'] !== 'latest'
      ) {
        issues.push('api.generation.scope must be latest');
      }
    }

    if (
      manual !== undefined &&
      (!isRecord(manual) || typeof manual['dataDirectory'] !== 'string')
    ) {
      issues.push('manual.dataDirectory must be a string');
    }
    if (typeof sourceLocale !== 'string' || !isLocaleTag(sourceLocale)) {
      issues.push('sourceLocale must be a valid locale tag');
    }
    if (
      !Array.isArray(locales) ||
      locales.some(locale => typeof locale !== 'string' || !isLocaleTag(locale))
    ) {
      issues.push('locales must be an array of valid locale tags');
    } else {
      if (typeof sourceLocale === 'string' && !locales.includes(sourceLocale)) {
        issues.push('locales must include sourceLocale');
      }
      if (new Set(locales).size !== locales.length) {
        issues.push('locales must not contain duplicates');
      }
    }
    if (config['translationWorkDirectory'] !== undefined) {
      issues.push('translationWorkDirectory is no longer supported; use translationDirectory');
    }
    if (
      config['translationDirectory'] !== undefined &&
      typeof config['translationDirectory'] !== 'string'
    ) {
      issues.push('translationDirectory must be a string');
    }
    if (config['cdn'] !== undefined) {
      const cdn = config['cdn'];
      let validBaseUrl = false;

      if (isRecord(cdn) && typeof cdn['baseUrl'] === 'string') {
        try {
          const url = new URL(cdn['baseUrl']);

          validBaseUrl =
            ['http:', 'https:'].includes(url.protocol) &&
            url.username.length === 0 &&
            url.password.length === 0 &&
            url.search.length === 0 &&
            url.hash.length === 0;
        } catch {
          validBaseUrl = false;
        }
      }
      if (!validBaseUrl) {
        issues.push('cdn.baseUrl must be an HTTP(S) URL without credentials, query, or hash');
      }
    }
    if (
      config['siteName'] !== undefined &&
      (typeof config['siteName'] !== 'string' ||
        config['siteName'].trim() === '')
    ) {
      issues.push('siteName must be a non-empty string');
    }
    const manualCollections = isRecord(manual)
      ? manual['collections']
      : undefined;

    issues.push(...validateManualCollections(manualCollections, locales));
    const pageValidation = parseSitePages(
      config['pages'],
      Array.isArray(locales)
        ? locales.filter((locale): locale is string => typeof locale === 'string')
        : [],
    );

    issues.push(...pageValidation.issues);
    if (config['pages'] !== undefined) {
      pages = pageValidation.pages;
    }
  }
  if (issues.length > 0) {
    const exportKeys = isRecord(config) ? Object.keys(config).join(', ') : '';

    throw new Error(
      `Invalid docs site config: ${filename} (${issues.join('; ')}; exports: ${exportKeys})`,
    );
  }

  const input = config as SiteConfigInput;
  const manualCollectionsInput = input.manual?.collections;
  const dataDirectory = path.resolve(
    root,
    input.api !== undefined
      ? path.dirname(input.api.dataDirectory)
      : input.manual !== undefined
        ? path.dirname(input.manual.dataDirectory)
        : 'site/public/data',
  );
  const apiDirectory =
    input.api === undefined
      ? path.join(dataDirectory, 'api')
      : path.resolve(root, input.api.dataDirectory);
  const apiVersions =
    input.api?.repository === undefined && input.api?.versions === undefined
      ? undefined
      : parseAPIVersionManifest({
          repository: input.api.repository,
          versions: input.api.versions,
        });
  const manualDirectory =
    input.manual === undefined
      ? path.join(dataDirectory, 'manual')
      : path.resolve(root, input.manual.dataDirectory);
  const translationDirectory = path.resolve(
    root,
    input.translationDirectory ?? 'tmp/docs-tools',
  );
  const apiTranslationDirectory = path.join(
    translationDirectory,
    'api-translation',
  );
  const translationCacheDirectory = path.join(
    translationDirectory,
    'translation-cache',
  );
  const cdnBaseUrl = isRecord(config) && isRecord(config['cdn']) &&
    typeof config['cdn']['baseUrl'] === 'string'
    ? `${config['cdn']['baseUrl'].replace(/\/+$/u, '')}/`
    : undefined;

  if (
    !isWithin(root, dataDirectory) ||
    (input.api !== undefined && !isWithin(root, apiDirectory)) ||
    ((input.manual !== undefined || manualCollectionsInput !== undefined) &&
      !isWithin(root, manualDirectory)) ||
    !isWithin(root, translationDirectory) ||
    isWithin(apiDirectory, translationDirectory) ||
    isWithin(translationDirectory, apiDirectory) ||
    isWithin(manualDirectory, translationDirectory) ||
    isWithin(translationDirectory, manualDirectory)
  ) {
    throw new Error(
      `Configured data and work directories must stay inside the repository: ${filename}`,
    );
  }
  if (input.api !== undefined) {
    await assertNoSymlinkPath(root, apiDirectory);
  }
  if (input.manual !== undefined || manualCollectionsInput !== undefined) {
    await assertNoSymlinkPath(root, manualDirectory);
  }
  await assertNoSymlinkPath(root, translationDirectory);
  let apiPackages: APIPackageConfig[] | undefined;

  if (input.api?.packages !== undefined) {
    apiPackages = [];
    for (const packageConfig of input.api.packages) {
      const packageDirectory = path.resolve(root, packageConfig.directory);
      const tsconfigPath = path.resolve(
        packageDirectory,
        packageConfig.tsconfig,
      );

      if (
        !isWithin(root, packageDirectory) ||
        !isWithin(packageDirectory, tsconfigPath)
      ) {
        throw new Error(
          `API package paths must stay inside the repository: ${packageConfig.key}`,
        );
      }
      await assertNoSymlinkPath(root, packageDirectory);
      await assertNoSymlinkPath(root, tsconfigPath);
      for (const entry of packageConfig.entries) {
        for (const sourcePath of [entry.source, entry.types]) {
          const absolutePath = path.resolve(packageDirectory, sourcePath);

          if (!isWithin(packageDirectory, absolutePath)) {
            throw new Error(
              `API entry path must stay inside its package: ${packageConfig.key}/${sourcePath}`,
            );
          }
          await assertNoSymlinkPath(root, absolutePath);
        }
      }
      let readme: APIReadmeConfig | undefined;

      if (packageConfig.readme !== undefined) {
        const files: Record<string, string> = {};

        for (const [locale, filename] of Object.entries(
          packageConfig.readme.files,
        )) {
          const absolutePath = path.resolve(packageDirectory, filename);

          if (!isWithin(packageDirectory, absolutePath)) {
            throw new Error(
              `API package README path must stay inside its package: ${packageConfig.key}/${filename}`,
            );
          }
          await assertNoSymlinkPath(root, absolutePath);
          files[locale] = absolutePath;
        }
        readme = { ...packageConfig.readme, files };
      }
      apiPackages.push({
        ...packageConfig,
        directory: packageDirectory,
        tsconfig: tsconfigPath,
        entries: packageConfig.entries.map(entry => ({
          ...entry,
          source: path.resolve(packageDirectory, entry.source),
          types: path.resolve(packageDirectory, entry.types),
        })),
        ...(readme === undefined ? {} : { readme }),
      });
    }
  }
  let manuals: ManualCollectionConfig[] | undefined;

  if (manualCollectionsInput !== undefined) {
    manuals = [];
    for (const collection of manualCollectionsInput as ManualCollectionConfig[]) {
      let source = collection.source;

      if (source.type === 'local') {
        const directory = path.resolve(root, source.directory);

        if (!isWithin(root, directory)) {
          throw new Error(
            `Manual source directory must stay inside the repository: ${source.directory}`,
          );
        }
        await assertNoSymlinkPath(root, directory);
        source = { ...source, directory };
      }
      manuals.push({
        ...collection,
        source,
      });
    }
  }

  return {
    repositoryRoot: root,
    configPath: filename,
    sourceLocale: input.sourceLocale,
    locales: [...input.locales],
    apiDirectory,
    ...(apiVersions === undefined ? {} : { apiVersions }),
    apiConfigured: input.api !== undefined,
    manualDirectory,
    manualConfigured:
      input.manual !== undefined || manualCollectionsInput !== undefined,
    translationDirectory,
    apiTranslationDirectory,
    translationCacheDirectory,
    ...(cdnBaseUrl === undefined ? {} : { cdnBaseUrl }),
    ...(input.siteName === undefined ? {} : { siteName: input.siteName }),
    ...(pages === undefined ? {} : { pages }),
    ...(apiPackages === undefined ? {} : { apiPackages }),
    ...(manuals === undefined ? {} : { manuals }),
    ...(input.api?.typedocOptions === undefined
      ? {}
      : { typedocOptions: input.api.typedocOptions }),
    ...(input.api?.sourceLinkTemplate === undefined
      ? {}
      : { sourceLinkTemplate: input.api.sourceLinkTemplate }),
  };
}
