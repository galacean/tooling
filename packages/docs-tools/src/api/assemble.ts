import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isRecord, parseAPIManifest } from '@galacean/docs-site';
import type {
  APIManifest,
  APIManifestPackage,
  APIVersion,
} from '@galacean/docs-site';
import type { DocsSiteConfig } from '../config/site-config';
import { assertNoSymlinkPath } from '../config/site-config';
import { readJSON } from './read-json';
import { sourceProject } from './snapshot';
import { readAPISnapshot } from './snapshot-reference';
import {
  buildTranslationSource,
  collectCommentFields,
  contentHash,
  localizeProject,
  localizeProjectWithFallback,
  translateParts,
} from './translations';
import type { DocumentationPackage } from './translations';
import { compareVersions, parseVersion, versionGroup } from './versions';

export interface APIDocumentationPackage extends DocumentationPackage {
  version: string;
  entries: {
    key: string;
    source: string;
    types: string;
    id: number;
    symbols: { name: string; id: number; kind: number }[];
  }[];
}

export interface APIDocumentationMetadata {
  commit: string;
  generatorVersion: string;
  sourceHash: string;
  packages: APIDocumentationPackage[];
}

interface StagedFile {
  temporaryPath: string;
  filename: string;
}

function errorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

async function readOptionalJSON(filename: string): Promise<unknown> {
  try {
    return await readJSON(filename);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      throw error;
    }
  }

  return undefined;
}

async function readOptionalSnapshot(
  filename: string,
  dataRoot: string,
  repositoryRoot: string,
): Promise<unknown> {
  try {
    return (await readAPISnapshot(filename, dataRoot, repositoryRoot)).value;
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      throw error;
    }
  }

  return undefined;
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function safeSnapshotPath(dataRoot: string, relativePath: string): string {
  if (
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.includes('\\') ||
    relativePath
      .split('/')
      .some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`Unsafe API snapshot path in manifest: ${relativePath}`);
  }
  const filename = path.resolve(dataRoot, relativePath);

  if (!isWithin(dataRoot, filename)) {
    throw new Error(
      `API snapshot path leaves the data directory: ${relativePath}`,
    );
  }

  return filename;
}

function retainedVersions<T extends { version: string }>(versions: T[]): T[] {
  const groups = new Map<string, T>();

  for (const item of [...versions].sort((left, right) =>
    compareVersions(right.version, left.version),
  )) {
    const group = versionGroup(item.version);

    if (!groups.has(group)) {
      groups.set(group, item);
    }
  }

  return [...groups.values()];
}

function historyLayout(
  manifest: APIManifest,
  locales: string[],
): 'package-key' | 'flat' {
  let packageKeyLayout = true;
  let flatLayout = true;

  for (const pkg of manifest.packages) {
    for (const version of pkg.versions) {
      const configuredLocales = [...locales].sort();
      const manifestLocales = Object.keys(version.json).sort();

      if (
        JSON.stringify(configuredLocales) !== JSON.stringify(manifestLocales)
      ) {
        throw new Error(
          `API manifest locales do not match configured locales: ${pkg.key}@${version.version}`,
        );
      }
      for (const locale of locales) {
        const relativePath = version.json[locale];
        const packagePath = `api/${pkg.key}/${version.version}/${locale}.api.json`;
        const sharedPath = `api/snapshots/${version.snapshot}/${locale}.api.json`;
        const flatPath = `api/${version.version}/${locale}.api.json`;

        packageKeyLayout &&= relativePath === packagePath || relativePath === sharedPath;
        flatLayout &&= relativePath === flatPath;
      }
    }
  }
  if (packageKeyLayout) {
    return 'package-key';
  }
  if (flatLayout) {
    return 'flat';
  }
  throw new Error('API manifest uses an unsupported mixed snapshot layout');
}

async function recoverTranslations(
  dataRoot: string,
  previous: APIManifestPackage | undefined,
  currentSource: ReturnType<typeof buildTranslationSource>,
  config: Pick<DocsSiteConfig, 'repositoryRoot' | 'sourceLocale' | 'locales'>,
): Promise<{
  translations: Record<string, Record<string, string>>;
  warnings: string[];
}> {
  const translations: Record<string, Record<string, string>> = {};
  const warnings: string[] = [];
  const oldSourcePath = previous?.current.json[config.sourceLocale];

  if (oldSourcePath === undefined) {
    return { translations, warnings };
  }
  const oldEnglishPath = safeSnapshotPath(dataRoot, oldSourcePath);

  const oldSourceSnapshot = await readOptionalSnapshot(
    oldEnglishPath,
    dataRoot,
    config.repositoryRoot,
  );

  if (
    !isRecord(oldSourceSnapshot) ||
    oldSourceSnapshot['locale'] !== config.sourceLocale ||
    !isRecord(oldSourceSnapshot['apiSnapshot']) ||
    !Array.isArray(oldSourceSnapshot['apiSnapshot']['packages'])
  ) {
    warnings.push(
      'Previous source API snapshot is unavailable or invalid; translations will use source text.',
    );

    return { translations, warnings };
  }
  const oldPackages = oldSourceSnapshot['apiSnapshot'][
    'packages'
  ] as DocumentationPackage[];
  const oldProject = sourceProject(oldSourceSnapshot);
  const oldTranslationSource = buildTranslationSource(oldProject, oldPackages, {
    sourceLocale: config.sourceLocale,
  });
  const oldSourceFields = new Map(
    oldTranslationSource.fields.map(field => [field.key, field]),
  );

  for (const locale of config.locales) {
    if (locale === config.sourceLocale) {
      continue;
    }
    const oldLocalizedPath = previous?.current.json[locale];

    if (oldLocalizedPath === undefined) {
      continue;
    }
    const oldTargetPath = safeSnapshotPath(dataRoot, oldLocalizedPath);

    const oldLocalizedSnapshot = await readOptionalSnapshot(
      oldTargetPath,
      dataRoot,
      config.repositoryRoot,
    );

    if (
      !isRecord(oldLocalizedSnapshot) ||
      oldLocalizedSnapshot['locale'] !== locale ||
      JSON.stringify(oldLocalizedSnapshot['apiSnapshot']) !==
        JSON.stringify(oldSourceSnapshot['apiSnapshot'])
    ) {
      warnings.push(
        `${locale}: previous localized API snapshot is unavailable or invalid.`,
      );
      continue;
    }
    const oldFields = collectCommentFields(oldLocalizedSnapshot, oldPackages, {
      sourceLocale: config.sourceLocale,
    });
    const oldLocalizedFields = new Map(
      oldFields.map(field => [field.key, field]),
    );
    const localeTranslations: Record<string, string> = {};

    for (const field of currentSource.fields) {
      if (field.sourceLocale === locale) {
        continue;
      }
      const oldField = oldSourceFields.get(field.key);
      const localizedField = oldLocalizedFields.get(field.key);

      if (
        oldField?.sourceText !== field.sourceText ||
        localizedField?.sourceLocale !== locale
      ) {
        continue;
      }
      try {
        translateParts(field, localizedField.sourceText);
        localeTranslations[field.key] = localizedField.sourceText;
      } catch {
        warnings.push(
          `${locale}: skipped invalid preserved translation ${field.key}.`,
        );
      }
    }
    translations[locale] = localeTranslations;
  }

  return { translations, warnings };
}

function updatePackage(
  previous: APIManifestPackage | undefined,
  generated: APIVersion,
  metadata: APIDocumentationPackage,
): APIManifestPackage {
  const versions = retainedVersions([
    generated,
    ...(previous?.versions.filter(item => item.version !== generated.version) ??
      []),
  ]);
  const latest = versions[0];

  if (latest === undefined) {
    throw new Error(`Missing retained API version: ${metadata.key}`);
  }
  const current = {
    ...latest,
    version: 'current' as const,
    packageVersion: latest.version,
  };

  return {
    key: metadata.key,
    name: metadata.name,
    latestVersion: latest.version,
    entries: latest.entries,
    current,
    versions,
  };
}

async function stageFile(
  filename: string,
  contents: string,
): Promise<StagedFile> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporaryPath = `${filename}.${randomUUID()}.tmp`;

  await writeFile(temporaryPath, contents, { flag: 'wx' });

  return { temporaryPath, filename };
}

export async function assembleAPIDocumentation(
  project: Record<string, unknown>,
  metadata: APIDocumentationMetadata,
  config: DocsSiteConfig,
  selectedPackageKeys: string[] = metadata.packages.map(pkg => pkg.key),
): Promise<{ packages: number; exports: number; warnings: string[] }> {
  if (metadata.packages.length === 0 || selectedPackageKeys.length === 0) {
    throw new Error('API generation requires at least one configured package');
  }
  const selected = new Set(selectedPackageKeys);

  if (
    selected.size !== selectedPackageKeys.length ||
    selectedPackageKeys.some(
      key => !metadata.packages.some(pkg => pkg.key === key),
    )
  ) {
    throw new Error(
      'API generation selected unknown or duplicate package keys',
    );
  }
  const selectedPackages = metadata.packages.filter(pkg =>
    selected.has(pkg.key),
  );
  const source = buildTranslationSource(project, metadata.packages, {
    sourceLocale: config.sourceLocale,
  });
  const dataRoot = path.dirname(config.apiDirectory);
  const manifestPath = path.join(config.apiDirectory, 'manifest.json');
  const previousValue = await readOptionalJSON(manifestPath);
  let previous =
    previousValue === undefined ? undefined : parseAPIManifest(previousValue);
  const ignoredFlatHistory =
    previous !== undefined &&
    historyLayout(previous, config.locales) === 'flat';

  if (ignoredFlatHistory) {
    previous = undefined;
  }
  if (previous !== undefined) {
    for (const pkg of previous.packages) {
      for (const item of pkg.versions) {
        parseVersion(item.version);
      }
    }
  }
  if (previous === undefined && selected.size !== metadata.packages.length) {
    throw new Error(
      'Initial API generation must include every configured package',
    );
  }
  const packageMetadata = metadata.packages.map(pkg => ({
    key: pkg.key,
    name: pkg.name,
    version: pkg.version,
    entries: pkg.entries,
  }));
  const snapshotHash = contentHash({
    sourceHash: metadata.sourceHash,
    commit: metadata.commit,
    generatorVersion: metadata.generatorVersion,
    sourceLocale: config.sourceLocale,
    locales: config.locales,
    packages: packageMetadata,
  });
  const apiSnapshot = {
    commit: metadata.commit,
    generatorVersion: metadata.generatorVersion,
    sourceHash: metadata.sourceHash,
    snapshot: snapshotHash,
    packages: packageMetadata,
  };
  const warnings = ignoredFlatHistory
    ? [
        'The legacy flat API manifest was ignored; generation starts a new package-key history. ' +
          'Existing flat snapshot files were left untouched.',
      ]
    : [];
  const localizedSnapshots = new Map<string, string>();
  const contentSnapshots = new Map<string, string>();
  const preservedTranslations = new Map<string, Record<string, string>>(
    config.locales.map(locale => [locale, {}]),
  );

  for (const pkg of metadata.packages) {
    const previousPackage = previous?.packages.find(
      item => item.key === pkg.key,
    );

    if (previousPackage === undefined) {
      continue;
    }
    const preserved = await recoverTranslations(
      dataRoot,
      previousPackage,
      source,
      config,
    );

    warnings.push(...preserved.warnings);
    for (const [locale, translations] of Object.entries(preserved.translations)) {
      const merged = preservedTranslations.get(locale);

      if (merged === undefined) {
        continue;
      }
      for (const [key, translation] of Object.entries(translations)) {
        const existing = merged[key];

        if (existing !== undefined && existing !== translation) {
          throw new Error(`Conflicting preserved API translations for ${locale}: ${key}`);
        }
        merged[key] = translation;
      }
    }
  }

  for (const pkg of selectedPackages) {
    for (const locale of config.locales) {
      const translations = preservedTranslations.get(locale) ?? {};
      const localized =
        locale === config.sourceLocale
          ? localizeProject(project, source, undefined, locale)
          : localizeProjectWithFallback(
              project,
              source,
              translations,
              locale,
            );
      const snapshot = Object.assign(localized, { locale, apiSnapshot });
      const contents = `${JSON.stringify(snapshot)}\n`;
      const contentHash = createHash('sha256').update(contents).digest('hex');
      const contentPath = `api/snapshots/${contentHash}.api.json`;
      const existing = contentSnapshots.get(contentPath);

      if (existing !== undefined && existing !== contents) {
        throw new Error(`API snapshot hash collision: ${contentPath}`);
      }
      contentSnapshots.set(contentPath, contents);
      localizedSnapshots.set(
        `${pkg.key}\0${locale}`,
        `${JSON.stringify({ $ref: contentPath })}\n`,
      );
      const missing = source.fields.filter(
        field =>
          field.sourceLocale !== locale &&
          translations[field.key] === undefined,
      ).length;

      if (missing > 0) {
        warnings.push(
          `${pkg.key}/${locale}: ${missing} API comment fields use source-language fallback.`,
        );
      }
    }
  }

  const previousPackages = previous?.packages ?? [];
  const generatedPackages = selectedPackages.map(pkg => {
    const previousPackage = previousPackages.find(item => item.key === pkg.key);
    const version: APIVersion = {
      version: pkg.version,
      snapshot: snapshotHash,
      commit: metadata.commit,
      entries: pkg.entries,
      json: Object.fromEntries(
        config.locales.map(locale => [
          locale,
          `api/${pkg.key}/${pkg.version}/${locale}.api.json`,
        ]),
      ),
    };

    for (const oldVersion of previousPackage?.versions ?? []) {
      if (
        versionGroup(oldVersion.version) === versionGroup(pkg.version) &&
        compareVersions(oldVersion.version, pkg.version) > 0
      ) {
        throw new Error(
          `Cannot replace newer API documentation: ${pkg.key}@${pkg.version}`,
        );
      }
    }

    return updatePackage(previousPackage, version, pkg);
  });
  const generatedByKey = new Map(generatedPackages.map(pkg => [pkg.key, pkg]));
  const allKeys = new Set([
    ...(previous?.packages.map(pkg => pkg.key) ?? []),
    ...metadata.packages.map(pkg => pkg.key),
  ]);
  const packages = [...allKeys].map(key => {
    const generated = generatedByKey.get(key);
    const existing = previous?.packages.find(pkg => pkg.key === key);

    if (generated !== undefined) {
      return generated;
    }
    if (existing !== undefined) {
      return existing;
    }
    throw new Error(`No API snapshot was generated for package ${key}`);
  });
  const manifest = parseAPIManifest({
    schemaVersion: 2,
    defaultVersion: 'current',
    packages,
  });
  const staged: StagedFile[] = [];
  const completed: string[] = [];

  try {
    for (const [relativePath, contents] of contentSnapshots) {
      const filename = safeSnapshotPath(dataRoot, relativePath);

      await assertNoSymlinkPath(config.repositoryRoot, filename);
      staged.push(await stageFile(filename, contents));
    }
    for (const pkg of selectedPackages) {
      for (const locale of config.locales) {
        const relativePath = `api/${pkg.key}/${pkg.version}/${locale}.api.json`;
        const filename = safeSnapshotPath(dataRoot, relativePath);
        const contents = localizedSnapshots.get(`${pkg.key}\0${locale}`);

        await assertNoSymlinkPath(config.repositoryRoot, filename);
        if (contents === undefined) {
          throw new Error(`Missing generated API snapshot: ${pkg.key}/${locale}`);
        }
        staged.push(await stageFile(filename, contents));
      }
    }
    await assertNoSymlinkPath(config.repositoryRoot, manifestPath);
    staged.push(
      await stageFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
    );
    for (const file of staged) {
      await rename(file.temporaryPath, file.filename);
      completed.push(file.filename);
    }
  } catch (error) {
    await Promise.all(
      staged.map(file => rm(file.temporaryPath, { force: true })),
    );
    if (completed.length > 0) {
      throw new Error(
        `API generation partially wrote ${completed.length} file(s); manifest is committed last. ` +
          `Completed: ${completed.join(', ')}`,
        { cause: error },
      );
    }
    throw error;
  }

  const exportCount = selectedPackages
    .flatMap(pkg => pkg.entries)
    .reduce((sum, entry) => sum + entry.symbols.length, 0);

  return { packages: selectedPackages.length, exports: exportCount, warnings };
}
