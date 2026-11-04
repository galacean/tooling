import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJSON } from '../api/read-json';

export interface DocsSiteConfig {
  repositoryRoot: string;
  configPath: string;
  sourceLocale: string;
  locales: string[];
  apiDirectory: string;
  translationWorkDirectory: string;
  siteName?: string;
  packageReadmes?: Record<string, Record<string, string>>;
  packageReadmeSourceLocales?: Record<string, string>;
  apiPackages?: APIPackageConfig[];
  typedocOptions?: Record<string, unknown>;
  sourceLinkTemplate?: string;
}

export interface APIEntryConfig {
  key: string;
  source: string;
  types: string;
}

export interface APIPackageConfig {
  key: string;
  name: string;
  directory: string;
  tsconfig: string;
  entries: APIEntryConfig[];
}

interface SiteConfigInput {
  api: {
    dataDirectory: string;
    packages?: APIPackageConfig[];
    typedocOptions?: Record<string, unknown>;
    sourceLinkTemplate?: string;
  };
  sourceLocale: string;
  locales: string[];
  translationWorkDirectory?: string;
  siteName?: string;
  packageReadmes?: Record<string, Record<string, string>>;
  packageReadmeSourceLocales?: Record<string, string>;
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

function isSafeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.includes('\\') &&
    value
      .split('/')
      .every(segment => segment !== '' && segment !== '.' && segment !== '..')
  );
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
    const locales = config['locales'];
    const sourceLocale = config['sourceLocale'];

    if (!isRecord(api) || typeof api['dataDirectory'] !== 'string') {
      issues.push('api.dataDirectory must be a string');
    } else {
      const packages = api['packages'];

      if (
        packages !== undefined &&
        (!Array.isArray(packages) || packages.length === 0)
      ) {
        issues.push('api.packages must be a non-empty array');
      } else if (Array.isArray(packages)) {
        const keys = new Set<string>();

        for (const [index, packageConfig] of packages.entries()) {
          if (
            !isRecord(packageConfig) ||
            typeof packageConfig['key'] !== 'string' ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(packageConfig['key']) ||
            keys.has(packageConfig['key']) ||
            typeof packageConfig['name'] !== 'string' ||
            packageConfig['name'].length === 0 ||
            typeof packageConfig['directory'] !== 'string' ||
            !isSafeRelativePath(packageConfig['directory']) ||
            typeof packageConfig['tsconfig'] !== 'string' ||
            !isSafeRelativePath(packageConfig['tsconfig']) ||
            !Array.isArray(packageConfig['entries']) ||
            packageConfig['entries'].length === 0
          ) {
            issues.push(
              `api.packages[${index}] must declare unique key, name, directory, tsconfig, and entries`,
            );
            continue;
          }
          keys.add(packageConfig['key']);
          const entryKeys = new Set<string>();

          for (const [entryIndex, entry] of packageConfig[
            'entries'
          ].entries()) {
            if (
              !isRecord(entry) ||
              typeof entry['key'] !== 'string' ||
              entry['key'].length === 0 ||
              entryKeys.has(entry['key']) ||
              typeof entry['source'] !== 'string' ||
              !isSafeRelativePath(entry['source']) ||
              typeof entry['types'] !== 'string' ||
              !isSafeRelativePath(entry['types'])
            ) {
              issues.push(
                `api.packages[${index}].entries[${entryIndex}] must declare a unique key, source, and types path`,
              );
              continue;
            }
            entryKeys.add(entry['key']);
          }
        }
      }
      if (
        api['typedocOptions'] !== undefined &&
        !isRecord(api['typedocOptions'])
      ) {
        issues.push('api.typedocOptions must be an object');
      }
      if (
        api['sourceLinkTemplate'] !== undefined &&
        typeof api['sourceLinkTemplate'] !== 'string'
      ) {
        issues.push('api.sourceLinkTemplate must be a string');
      }
    }
    if (typeof sourceLocale !== 'string') {
      issues.push('sourceLocale must be a string');
    }
    if (
      !Array.isArray(locales) ||
      locales.some(locale => typeof locale !== 'string')
    ) {
      issues.push('locales must be an array of strings');
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
    if (
      config['packageReadmes'] !== undefined &&
      !isRecord(config['packageReadmes'])
    ) {
      issues.push('packageReadmes must map package keys to locale paths');
    } else if (isRecord(config['packageReadmes'])) {
      const configuredLocales = Array.isArray(locales)
        ? locales.filter(
            (locale): locale is string => typeof locale === 'string',
          )
        : [];

      for (const [packageKey, localePaths] of Object.entries(
        config['packageReadmes'],
      )) {
        const configuredSourceLocale = isRecord(config['packageReadmeSourceLocales'])
          ? config['packageReadmeSourceLocales'][packageKey]
          : undefined;
        const packageSourceLocale =
          typeof configuredSourceLocale === 'string'
            ? configuredSourceLocale
            : sourceLocale;

        if (
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(packageKey) ||
          !isRecord(localePaths) ||
          typeof packageSourceLocale !== 'string' ||
          !configuredLocales.includes(packageSourceLocale) ||
          typeof localePaths[packageSourceLocale] !== 'string' ||
          Object.entries(localePaths).some(
            ([locale, filename]) =>
              !configuredLocales.includes(locale) ||
              typeof filename !== 'string' ||
              !isSafeRelativePath(filename),
          )
        ) {
          issues.push(
            `packageReadmes.${packageKey} must declare safe paths for configured locales`,
          );
        }
      }
    }
    if (config['packageReadmeSourceLocales'] !== undefined) {
      if (!isRecord(config['packageReadmeSourceLocales'])) {
        issues.push('packageReadmeSourceLocales must map package keys to locales');
      } else {
        for (const [packageKey, locale] of Object.entries(
          config['packageReadmeSourceLocales'],
        )) {
          if (
            !isRecord(config['packageReadmes']) ||
            !(packageKey in config['packageReadmes']) ||
            typeof locale !== 'string' ||
            !Array.isArray(locales) ||
            !locales.includes(locale)
          ) {
            issues.push(
              `packageReadmeSourceLocales.${packageKey} must reference a configured README package and locale`,
            );
          }
        }
      }
    }
  }
  if (issues.length > 0) {
    const exportKeys = isRecord(config) ? Object.keys(config).join(', ') : '';

    throw new Error(
      `Invalid docs site config: ${filename} (${issues.join('; ')}; exports: ${exportKeys})`,
    );
  }

  const input = config as SiteConfigInput;
  const apiDirectory = path.resolve(root, input.api.dataDirectory);
  const translationWorkDirectory = path.resolve(
    root,
    input.translationWorkDirectory ?? 'tmp/docs-tools/api-translation',
  );

  if (
    !isWithin(root, apiDirectory) ||
    !isWithin(root, translationWorkDirectory)
  ) {
    throw new Error(
      `Configured data and work directories must stay inside the repository: ${filename}`,
    );
  }
  await assertNoSymlinkPath(root, apiDirectory);
  await assertNoSymlinkPath(root, translationWorkDirectory);
  let apiPackages: APIPackageConfig[] | undefined;

  if (input.api.packages !== undefined) {
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
      apiPackages.push({
        ...packageConfig,
        directory: packageDirectory,
        tsconfig: tsconfigPath,
        entries: packageConfig.entries.map(entry => ({
          ...entry,
          source: path.resolve(packageDirectory, entry.source),
          types: path.resolve(packageDirectory, entry.types),
        })),
      });
    }
  }
  let packageReadmes: Record<string, Record<string, string>> | undefined;

  if (input.packageReadmes !== undefined) {
    packageReadmes = {};
    for (const [packageKey, localePaths] of Object.entries(
      input.packageReadmes,
    )) {
      packageReadmes[packageKey] = {};
      for (const [locale, filename] of Object.entries(localePaths)) {
        const absolutePath = path.resolve(root, filename);

        if (!isWithin(root, absolutePath)) {
          throw new Error(
            `Package README path must stay inside the repository: ${filename}`,
          );
        }
        await assertNoSymlinkPath(root, absolutePath);
        packageReadmes[packageKey][locale] = absolutePath;
      }
    }
  }

  return {
    repositoryRoot: root,
    configPath: filename,
    sourceLocale: input.sourceLocale,
    locales: [...input.locales],
    apiDirectory,
    translationWorkDirectory,
    ...(input.siteName === undefined ? {} : { siteName: input.siteName }),
    ...(packageReadmes === undefined ? {} : { packageReadmes }),
    ...(input.packageReadmeSourceLocales === undefined
      ? {}
      : { packageReadmeSourceLocales: input.packageReadmeSourceLocales }),
    ...(apiPackages === undefined ? {} : { apiPackages }),
    ...(input.api.typedocOptions === undefined
      ? {}
      : { typedocOptions: input.api.typedocOptions }),
    ...(input.api.sourceLinkTemplate === undefined
      ? {}
      : { sourceLinkTemplate: input.api.sourceLinkTemplate }),
  };
}
