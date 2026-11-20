import path from 'node:path';
import { assertNoSymlinkPath, isWithin } from '../path-validation';
import { parseAPIVersionManifest } from '../api/versions';
import type {
  APIEntryConfig,
  APIPackageConfig,
  APIReadmeConfig,
  DocsProjectConfigInput,
  ManualCollectionConfig,
  ResolvedDocsBuildConfig,
} from './types';

async function resolveAPIPackage(
  root: string,
  pkg: APIPackageConfig,
): Promise<APIPackageConfig> {
  const directory = path.resolve(root, pkg.directory);
  const tsconfig = path.resolve(directory, pkg.tsconfig);

  if (!isWithin(root, directory) || !isWithin(directory, tsconfig)) {
    throw new Error(`API package paths must stay inside the repository: ${pkg.key}`);
  }
  await assertNoSymlinkPath(root, directory);
  await assertNoSymlinkPath(root, tsconfig);

  async function resolveFile(filename: string, kind: 'entry' | 'package README'): Promise<string> {
    const absolutePath = path.resolve(directory, filename);

    if (!isWithin(directory, absolutePath)) {
      throw new Error(`API ${kind} path must stay inside its package: ${pkg.key}/${filename}`);
    }
    await assertNoSymlinkPath(root, absolutePath);

    return absolutePath;
  }

  const entries: APIEntryConfig[] = [];

  for (const entry of pkg.entries) {
    entries.push({
      ...entry,
      source: await resolveFile(entry.source, 'entry'),
      types: await resolveFile(entry.types, 'entry'),
    });
  }

  let readme: APIReadmeConfig | undefined;

  if (pkg.readme !== undefined) {
    const files: Record<string, string> = {};

    for (const [locale, filename] of Object.entries(pkg.readme.files)) {
      files[locale] = await resolveFile(filename, 'package README');
    }
    readme = { ...pkg.readme, files };
  }

  return { ...pkg, directory, tsconfig, entries, ...(readme === undefined ? {} : { readme }) };
}

export async function resolveDocsBuildConfig(
  input: DocsProjectConfigInput,
  root: string,
  filename: string,
): Promise<ResolvedDocsBuildConfig> {
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

  if (
    !isWithin(root, dataDirectory) ||
    (input.api !== undefined && !isWithin(root, apiDirectory)) ||
    (input.manual !== undefined && !isWithin(root, manualDirectory)) ||
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
  if (input.manual !== undefined) {
    await assertNoSymlinkPath(root, manualDirectory);
  }
  await assertNoSymlinkPath(root, translationDirectory);
  let apiPackages: APIPackageConfig[] | undefined;

  if (input.api?.packages !== undefined) {
    apiPackages = [];
    for (const pkg of input.api.packages) {
      apiPackages.push(await resolveAPIPackage(root, pkg));
    }
  }
  let manuals: ManualCollectionConfig[] | undefined;

  if (manualCollectionsInput !== undefined) {
    manuals = [];
    for (const collection of manualCollectionsInput) {
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
    manualConfigured: input.manual !== undefined,
    translationDirectory,
    apiTranslationDirectory,
    translationCacheDirectory,
    ...(input.dataBaseUrls === undefined ? {} : { dataBaseURLs: input.dataBaseUrls }),
    ...(input.siteName === undefined ? {} : { siteName: input.siteName }),
    ...(input.homeHref === undefined ? {} : { homeHref: input.homeHref }),
    ...(input.pages === undefined ? {} : { pages: input.pages }),
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
