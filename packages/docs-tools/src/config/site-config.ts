import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJSON } from '../api/read-json';
import { validateAPIConfig } from './api-config-validation';
import { validateManualCollections } from './manual-config-validation';

export interface DocsSiteConfig {
  repositoryRoot: string;
  configPath: string;
  sourceLocale: string;
  locales: string[];
  apiDirectory: string;
  apiConfigured?: boolean;
  manualDirectory: string;
  manualConfigured?: boolean;
  translationWorkDirectory: string;
  siteName?: string;
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
  translations?: Record<string, string>;
}

interface SiteConfigInput {
  api?: {
    dataDirectory: string;
    packages?: APIPackageConfig[];
    typedocOptions?: Record<string, unknown>;
    sourceLinkTemplate?: string;
  };
  manual?: { dataDirectory: string; collections?: unknown[] };
  sourceLocale: string;
  locales: string[];
  translationWorkDirectory?: string;
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
    if (
      config['translationWorkDirectory'] !== undefined &&
      typeof config['translationWorkDirectory'] !== 'string'
    ) {
      issues.push('translationWorkDirectory must be a string');
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
  const manualDirectory =
    input.manual === undefined
      ? path.join(dataDirectory, 'manual')
      : path.resolve(root, input.manual.dataDirectory);
  const translationWorkDirectory = path.resolve(
    root,
    input.translationWorkDirectory ?? 'tmp/docs-tools/api-translation',
  );

  if (
    !isWithin(root, dataDirectory) ||
    (input.api !== undefined && !isWithin(root, apiDirectory)) ||
    ((input.manual !== undefined || manualCollectionsInput !== undefined) &&
      !isWithin(root, manualDirectory)) ||
    !isWithin(root, translationWorkDirectory)
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
  await assertNoSymlinkPath(root, translationWorkDirectory);
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
      let translations: Record<string, string> | undefined;

      if (collection.translations !== undefined) {
        translations = {};
        for (const [locale, filename] of Object.entries(
          collection.translations,
        )) {
          const absolutePath = path.resolve(root, filename);

          if (!isWithin(root, absolutePath)) {
            throw new Error(
              `Manual translation path must stay inside the repository: ${filename}`,
            );
          }
          await assertNoSymlinkPath(root, absolutePath);
          translations[locale] = absolutePath;
        }
      }
      manuals.push({
        ...collection,
        source,
        ...(translations === undefined ? {} : { translations }),
      });
    }
  }

  return {
    repositoryRoot: root,
    configPath: filename,
    sourceLocale: input.sourceLocale,
    locales: [...input.locales],
    apiDirectory,
    apiConfigured: input.api !== undefined,
    manualDirectory,
    manualConfigured:
      input.manual !== undefined || manualCollectionsInput !== undefined,
    translationWorkDirectory,
    ...(input.siteName === undefined ? {} : { siteName: input.siteName }),
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
