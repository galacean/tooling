import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isRecord, parseAPIManifest, parseProject } from '@galacean/docs-site';
import type { APIManifest, APIVersion } from '@galacean/docs-site';
import { assertNoSymlinkPath } from '../config/site-config';
import type { DocsSiteConfig } from '../config/site-config';
import { loadTranslationInput } from './extract';
import {
  buildTranslationSource,
  collectCommentFields,
  contentHash,
  localizeProjectWithFallback,
  translateParts,
  validateTranslation,
} from './translations';
import type { DocumentationPackage } from './translations';
import { readJSON } from './read-json';
import { readAPISnapshot } from './snapshot-reference';
import { sourceProject } from './snapshot';

interface TranslationTaskField {
  key: string;
  sourceText: string;
  tokens: unknown[];
}

interface TranslationTask {
  schemaVersion: 1;
  sourceLocale: string;
  locale: string;
  packageKey: string;
  packageName: string;
  version: string;
  configHash: string;
  sourceHash: string;
  targetHash: string;
  sourcePath: string;
  targetPath: string;
  fields: TranslationTaskField[];
}

interface TranslationResult {
  locale: string;
  version: string;
  sourceHash: string;
  translations: Record<string, string>;
}

interface ApplyPair {
  taskPath: string;
  translationPath: string;
}

interface StagedFile {
  temporaryPath: string;
  filename: string;
}

interface ApplyOutput {
  taskPath: string;
  translationPath: string;
  targetPath: string;
  targetSnapshotPath: string;
  targetProject: Record<string, unknown>;
  packageKey: string;
  version: string;
  locale: string;
  apiSnapshot: Record<string, unknown>;
  source: Record<string, unknown>;
  translations: Record<string, string>;
}

type ApplyConfig = Pick<
  DocsSiteConfig,
  | 'repositoryRoot'
  | 'sourceLocale'
  | 'locales'
  | 'apiDirectory'
  | 'translationWorkDirectory'
>;

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function isSafeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.includes('\\') &&
    value
      .split(/[\\/]/u)
      .every(segment => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function isTaskField(value: unknown): value is TranslationTaskField {
  return (
    isRecord(value) &&
    typeof value['key'] === 'string' &&
    typeof value['sourceText'] === 'string' &&
    Array.isArray(value['tokens'])
  );
}

function isTranslationTask(value: unknown): value is TranslationTask {
  return (
    isRecord(value) &&
    value['schemaVersion'] === 1 &&
    typeof value['sourceLocale'] === 'string' &&
    typeof value['locale'] === 'string' &&
    typeof value['packageKey'] === 'string' &&
    typeof value['packageName'] === 'string' &&
    typeof value['version'] === 'string' &&
    typeof value['configHash'] === 'string' &&
    typeof value['sourceHash'] === 'string' &&
    typeof value['targetHash'] === 'string' &&
    typeof value['sourcePath'] === 'string' &&
    typeof value['targetPath'] === 'string' &&
    isSafeRelativePath(value['sourcePath']) &&
    isSafeRelativePath(value['targetPath']) &&
    Array.isArray(value['fields']) &&
    value['fields'].every(isTaskField)
  );
}

function isTranslationResult(value: unknown): value is TranslationResult {
  return (
    isRecord(value) &&
    typeof value['locale'] === 'string' &&
    typeof value['version'] === 'string' &&
    typeof value['sourceHash'] === 'string' &&
    isRecord(value['translations']) &&
    Object.values(value['translations']).every(
      item => typeof item === 'string',
    ) &&
    Object.keys(value).every(key =>
      ['locale', 'version', 'sourceHash', 'translations'].includes(key),
    )
  );
}

function sameTaskFields(
  left: TranslationTaskField[],
  right: TranslationInputFields[],
): boolean {
  return (
    left.length === right.length &&
    left.every((field, index) => {
      const expected = right[index];

      return (
        expected !== undefined &&
        field.key === expected.key &&
        field.sourceText === expected.sourceText &&
        JSON.stringify(field.tokens) === JSON.stringify(expected.tokens)
      );
    })
  );
}

interface TranslationInputFields {
  key: string;
  sourceText: string;
  tokens: unknown[];
}

function translationFromResult(
  value: TranslationResult,
  input: Awaited<ReturnType<typeof loadTranslationInput>>,
) {
  if (
    value.locale !== input.locale ||
    value.version !== input.version ||
    value.sourceHash !== input.sourceHash
  ) {
    throw new Error(
      'Translation result metadata does not match the current API source',
    );
  }
  const translation = {
    version: value.version,
    sourceHash: value.sourceHash,
    translations: value.translations,
  };

  validateTranslation(
    translation,
    input.translationSource,
    input.locale,
    input.version,
  );

  return translation;
}

function resolveManifestSnapshot(
  dataRoot: string,
  relativePath: string,
): string {
  if (!isSafeRelativePath(relativePath)) {
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

async function loadVersionSnapshots(
  config: ApplyConfig,
  version: APIVersion,
  updatedSnapshots: Map<string, Record<string, unknown>>,
  apiSnapshot: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const dataRoot = path.dirname(config.apiDirectory);
  const locales = config.locales;

  if (
    Object.keys(version.json).length !== locales.length ||
    locales.some(locale => version.json[locale] === undefined)
  ) {
    throw new Error(
      'API manifest locales do not match the configured site locales',
    );
  }
  const snapshots: Record<string, unknown> = {};

  for (const locale of locales) {
    const relativePath = version.json[locale];

    if (relativePath === undefined) {
      throw new Error(
        `API manifest is missing snapshot path for locale ${locale}`,
      );
    }
    const filename = resolveManifestSnapshot(dataRoot, relativePath);
    const updated = updatedSnapshots.get(filename);
    let snapshot: unknown;

    if (updated !== undefined) {
      snapshot = updated;
    } else {
      snapshot = (await readAPISnapshot(
        filename,
        dataRoot,
        config.repositoryRoot,
      )).value;
    }
    if (
      !isRecord(snapshot) ||
      snapshot['locale'] !== locale ||
      JSON.stringify(snapshot['apiSnapshot']) !== JSON.stringify(apiSnapshot)
    ) {
      throw new Error(`Invalid localized API snapshot: ${filename}`);
    }
    snapshots[locale] = snapshot;
  }

  return snapshots;
}

function localizedProject(
  snapshot: Record<string, unknown>,
  locales: string[],
): Record<string, unknown> {
  const project = structuredClone(snapshot);

  delete project['locale'];
  delete project['apiSnapshot'];

  return parseProject<Record<string, unknown>>(
    project,
    value => typeof value === 'string' && locales.includes(value),
  );
}

function updateManifestSnapshot(
  manifest: APIManifest,
  packageKey: string,
  packageVersion: string,
  snapshotHash: string,
): APIManifest {
  const pkg = manifest.packages.find(item => item.key === packageKey);

  if (pkg === undefined) {
    throw new Error(`API manifest does not contain package ${packageKey}`);
  }
  const selectedVersion = pkg.versions.find(
    item => item.version === packageVersion,
  );

  if (selectedVersion === undefined) {
    throw new Error(
      `API manifest does not contain version ${packageKey}@${packageVersion}`,
    );
  }
  const packages = manifest.packages.map(item => {
    if (item.key !== packageKey) {
      return item;
    }
    const versions = item.versions.map(version =>
      version.version === packageVersion
        ? { ...version, snapshot: snapshotHash }
        : version,
    );
    const current =
      item.current.packageVersion === packageVersion
        ? { ...item.current, snapshot: snapshotHash }
        : item.current;

    return { ...item, versions, current };
  });

  return parseAPIManifest({ ...manifest, packages });
}

async function stageFile(
  filename: string,
  contents: string,
): Promise<StagedFile> {
  const temporaryPath = `${filename}.${randomUUID()}.tmp`;

  await writeFile(temporaryPath, contents, { flag: 'wx' });

  return { temporaryPath, filename };
}

async function cleanupTemporaryFiles(files: StagedFile[]): Promise<void> {
  await Promise.all(files.map(file => rm(file.temporaryPath, { force: true })));
}

export function applyTranslationPairs(
  pairs: ApplyPair[],
  config: ApplyConfig,
): Promise<string[]> {
  return applyTranslationPairsWithRename(pairs, config, rename);
}

export async function applyTranslationPairsWithRename(
  pairs: ApplyPair[],
  config: ApplyConfig,
  renameFile: typeof rename,
): Promise<string[]> {
  if (pairs.length === 0) {
    throw new Error('Provide task/translation file pairs');
  }
  const workRoot = path.resolve(
    config.repositoryRoot,
    config.translationWorkDirectory,
  );
  const outputs: ApplyOutput[] = [];
  const targets = new Set<string>();

  for (const pair of pairs) {
    const taskPath = path.resolve(config.repositoryRoot, pair.taskPath);
    const translationPath = path.resolve(
      config.repositoryRoot,
      pair.translationPath,
    );
    const runDirectory = path.dirname(taskPath);

    if (
      !isWithin(workRoot, taskPath) ||
      path.dirname(translationPath) !== runDirectory ||
      !isWithin(runDirectory, translationPath)
    ) {
      throw new Error(
        `Task and translation files must share a run directory inside ${workRoot}`,
      );
    }
    await assertNoSymlinkPath(config.repositoryRoot, taskPath);
    await assertNoSymlinkPath(config.repositoryRoot, translationPath);
    const taskValue: unknown = await readJSON(taskPath);
    const resultValue: unknown = await readJSON(translationPath);

    if (!isTranslationTask(taskValue) || !isTranslationResult(resultValue)) {
      throw new Error(`Invalid translation task or result: ${taskPath}`);
    }
    if (
      taskValue.sourceLocale !== config.sourceLocale ||
      !config.locales.includes(taskValue.locale) ||
      taskValue.locale === config.sourceLocale
    ) {
      throw new Error(
        `Translation task locale does not match the current site config: ${taskPath}`,
      );
    }
    const absoluteTarget = path.resolve(
      config.apiDirectory,
      taskValue.targetPath,
    );

    if (!isWithin(config.apiDirectory, absoluteTarget)) {
      throw new Error(
        `API target path leaves the configured API directory: ${taskValue.targetPath}`,
      );
    }
    const input = await loadTranslationInput(absoluteTarget, config);

    if (
      taskValue.packageKey !== input.packageKey ||
      taskValue.packageName !== input.packageName ||
      taskValue.locale !== input.locale ||
      taskValue.version !== input.version ||
      taskValue.configHash !== input.configHash ||
      taskValue.sourceHash !== input.sourceHash ||
      taskValue.targetHash !== input.targetHash ||
      taskValue.sourcePath !== input.sourcePath ||
      taskValue.targetPath !== input.targetPath ||
      !sameTaskFields(taskValue.fields, input.fields)
    ) {
      throw new Error(
        `API source, target, config, or task fields changed after extraction: ${taskPath}`,
      );
    }
    if (targets.has(absoluteTarget)) {
      throw new Error(
        `Duplicate API snapshot in translation batch: ${taskValue.targetPath}`,
      );
    }
    const translation = translationFromResult(resultValue, input);

    targets.add(absoluteTarget);
    outputs.push({
      taskPath,
      translationPath,
      targetPath: absoluteTarget,
      targetSnapshotPath: input.targetSnapshotPath,
      targetProject: input.targetProject,
      packageKey: input.packageKey,
      version: input.version,
      locale: input.locale,
      apiSnapshot: input.apiSnapshot,
      source: input.project,
      translations: translation.translations,
    });
  }

  const manifestPath = path.join(config.apiDirectory, 'manifest.json');
  const dataRoot = path.dirname(config.apiDirectory);

  await assertNoSymlinkPath(config.repositoryRoot, manifestPath);
  let manifest = parseAPIManifest(await readJSON(manifestPath));
  const updatedSnapshots = new Map<string, Record<string, unknown>>();
  const snapshotGroups = new Map<string, ApplyOutput[]>();

  for (const output of outputs) {
    const pkg = manifest.packages.find(item => item.key === output.packageKey);
    const version = pkg?.versions.find(item => item.version === output.version);
    const relativePath = version?.json[output.locale];

    if (
      relativePath === undefined ||
      resolveManifestSnapshot(dataRoot, relativePath) !== output.targetPath
    ) {
      throw new Error(
        `API manifest path does not match translation target: ${output.targetPath}`,
      );
    }
    const key = `${output.locale}\u0000${contentHash(output.apiSnapshot)}`;
    const group = snapshotGroups.get(key) ?? [];

    group.push(output);
    snapshotGroups.set(key, group);
  }
  const snapshots = new Map<string, string>();
  const indexes = new Map<string, string>();

  for (const [groupKey, group] of snapshotGroups) {
    const first = group[0];

    if (first === undefined) {
      continue;
    }
    const snapshotKey = groupKey.slice(groupKey.indexOf('\u0000') + 1);

    if (
      group.some(
        output =>
          contentHash(output.apiSnapshot) !== snapshotKey ||
          contentHash(output.source) !== contentHash(first.source),
      )
    ) {
      throw new Error('Cannot combine translations from different API models');
    }
    const packageValues = first.apiSnapshot['packages'];

    if (!Array.isArray(packageValues)) {
      throw new Error('Invalid API package metadata in translation task');
    }
    const documentationPackages =
      packageValues as unknown as DocumentationPackage[];
    const translationSource = buildTranslationSource(
      first.source,
      documentationPackages,
      { sourceLocale: config.sourceLocale },
    );
    const sourceFields = new Map(
      translationSource.fields.map(field => [field.key, field]),
    );
    const translations: Record<string, string> = {};
    const suppliedTranslations: Record<string, string> = {};
    const candidateIndexes = new Map<
      string,
      { packageKey: string; version: APIVersion }
    >();
    const candidateSnapshotPaths = new Set<string>();

    for (const pkg of manifest.packages) {
      for (const version of pkg.versions) {
        const relativePath = version.json[first.locale];

        if (relativePath === undefined) {
          continue;
        }
        const filename = resolveManifestSnapshot(dataRoot, relativePath);
        const loaded = await readAPISnapshot(
          filename,
          dataRoot,
          config.repositoryRoot,
        );
        const snapshot = loaded.value;

        if (
          !isRecord(snapshot) ||
          snapshot['locale'] !== first.locale ||
          !isRecord(snapshot['apiSnapshot']) ||
          contentHash(snapshot['apiSnapshot']) !== snapshotKey
        ) {
          continue;
        }
        const targetProject = localizedProject(
          snapshot,
          config.locales,
        );

        for (const field of collectCommentFields(
          targetProject,
          documentationPackages,
          { sourceLocale: config.sourceLocale },
        )) {
          if (field.sourceLocale !== first.locale) {
            continue;
          }
          const sourceField = sourceFields.get(field.key);

          if (sourceField === undefined) {
            throw new Error(`Unknown localized API field: ${first.locale}/${field.key}`);
          }
          translateParts(sourceField, field.sourceText);
          const existing = translations[field.key];

          if (existing !== undefined && existing !== field.sourceText) {
            throw new Error(
              `Conflicting existing API translations: ${first.locale}/${field.key}`,
            );
          }
          translations[field.key] = field.sourceText;
        }
        candidateIndexes.set(filename, { packageKey: pkg.key, version });
        candidateSnapshotPaths.add(loaded.resolvedPath);
      }
    }
    for (const output of group) {
      if (
        !candidateIndexes.has(output.targetPath) ||
        !candidateSnapshotPaths.has(output.targetSnapshotPath)
      ) {
        throw new Error(
          `API manifest path does not match translation target: ${output.targetPath}`,
        );
      }
      for (const [key, text] of Object.entries(output.translations)) {
        const sourceField = sourceFields.get(key);

        if (sourceField === undefined) {
          throw new Error(`Unknown current API translation field: ${first.locale}/${key}`);
        }
        translateParts(sourceField, text);
        const existing = suppliedTranslations[key];

        if (existing !== undefined && existing !== text) {
          throw new Error(
            `Conflicting API translations in batch: ${first.locale}/${key}`,
          );
        }
        suppliedTranslations[key] = text;
      }
    }
    Object.assign(translations, suppliedTranslations);
    const mergedProject = {
      ...localizeProjectWithFallback(
        first.targetProject,
        translationSource,
        translations,
        first.locale,
      ),
      apiSnapshot: first.apiSnapshot,
    };
    const contents = `${JSON.stringify(mergedProject)}\n`;
    const relativePath = `api/snapshots/${createHash('sha256')
      .update(contents)
      .digest('hex')}.api.json`;
    const snapshotPath = resolveManifestSnapshot(dataRoot, relativePath);
    const existing = snapshots.get(snapshotPath);

    if (existing !== undefined && existing !== contents) {
      throw new Error(`API snapshot hash collision: ${relativePath}`);
    }
    snapshots.set(snapshotPath, contents);

    for (const [filename, candidate] of candidateIndexes) {
      const { packageKey, version } = candidate;
      const previousIndex = indexes.get(filename);
      const index = `${JSON.stringify({ $ref: relativePath })}\n`;

      if (previousIndex !== undefined && previousIndex !== index) {
        throw new Error(`API index belongs to multiple translation groups: ${filename}`);
      }
      indexes.set(filename, index);
      updatedSnapshots.set(filename, mergedProject);

      const sourcePath = version.json[config.sourceLocale];

      if (sourcePath === undefined) {
        throw new Error(
          `API manifest is missing source locale path for ${version.version}`,
        );
      }
      const sourceSnapshot = (
        await readAPISnapshot(
          resolveManifestSnapshot(dataRoot, sourcePath),
          dataRoot,
          config.repositoryRoot,
        )
      ).value;

      if (
        !isRecord(sourceSnapshot) ||
        sourceSnapshot['locale'] !== config.sourceLocale ||
        !isRecord(sourceSnapshot['apiSnapshot']) ||
        contentHash(sourceSnapshot['apiSnapshot']) !== snapshotKey
      ) {
        throw new Error(`Invalid source API snapshot for ${version.version}`);
      }
      const locales = await loadVersionSnapshots(
        config,
        version,
        updatedSnapshots,
        first.apiSnapshot,
      );
      const snapshotHash = contentHash({
        source: sourceProject(sourceSnapshot),
        metadata: first.apiSnapshot,
        locales,
      });

      manifest = updateManifestSnapshot(
        manifest,
        packageKey,
        version.version,
        snapshotHash,
      );
    }
  }
  const staged: StagedFile[] = [];

  try {
    for (const [filename, contents] of snapshots) {
      await mkdir(path.dirname(filename), { recursive: true });
      await assertNoSymlinkPath(config.repositoryRoot, filename);
      try {
        const existing = await readFile(filename, 'utf8');

        if (existing !== contents) {
          throw new Error(`API snapshot hash collision: ${filename}`);
        }
      } catch (error) {
        if (!(isRecord(error) && error['code'] === 'ENOENT')) {
          throw error;
        }
        staged.push(await stageFile(filename, contents));
      }
    }
    for (const [filename, contents] of indexes) {
      await mkdir(path.dirname(filename), { recursive: true });
      await assertNoSymlinkPath(config.repositoryRoot, filename);
      staged.push(await stageFile(filename, contents));
    }
    staged.push(
      await stageFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
    );
  } catch (error) {
    await cleanupTemporaryFiles(staged);
    throw error;
  }

  const committed: string[] = [];

  try {
    for (const file of staged) {
      await renameFile(file.temporaryPath, file.filename);
      committed.push(file.filename);
    }
  } catch (error) {
    await cleanupTemporaryFiles(staged);
    const message =
      committed.length === 0
        ? 'API apply failed before any target was updated'
        : `API apply partially updated ${committed.join(', ')}; manifest consistency may require recovery`;

    throw new Error(message, { cause: error });
  }

  for (const output of outputs) {
    await rm(output.taskPath, { force: true });
    await rm(output.translationPath, { force: true });
  }
  for (const directory of new Set(
    outputs.map(output => path.dirname(output.taskPath)),
  )) {
    try {
      await rmdir(directory);
    } catch (error) {
      if (!(isRecord(error) && error['code'] === 'ENOTEMPTY')) {
        throw error;
      }
    }
  }

  return outputs.map(output => output.targetPath);
}
