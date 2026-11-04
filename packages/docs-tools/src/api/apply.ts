import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isRecord, parseAPIManifest } from '@galacean/docs-site';
import type { APIManifest, APIVersion } from '@galacean/docs-site';
import { assertNoSymlinkPath } from '../config/site-config';
import type { DocsSiteConfig } from '../config/site-config';
import { loadTranslationInput } from './extract';
import {
  contentHash,
  localizeProject,
  validateTranslation,
} from './translations';
import { readJSON } from './read-json';

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
      await assertNoSymlinkPath(config.repositoryRoot, filename);
      snapshot = await readJSON(filename);
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
  const outputs: {
    taskPath: string;
    translationPath: string;
    targetPath: string;
    target: Record<string, unknown>;
    packageKey: string;
    version: string;
    locale: string;
    apiSnapshot: Record<string, unknown>;
    source: Record<string, unknown>;
  }[] = [];
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
    const localizedProject = localizeProject(
      input.project,
      input.translationSource,
      translation,
      input.locale,
    );
    const localized = { ...localizedProject, apiSnapshot: input.apiSnapshot };

    targets.add(absoluteTarget);
    outputs.push({
      taskPath,
      translationPath,
      targetPath: absoluteTarget,
      target: localized,
      packageKey: input.packageKey,
      version: input.version,
      locale: input.locale,
      apiSnapshot: input.apiSnapshot,
      source: input.project,
    });
  }

  const manifestPath = path.join(config.apiDirectory, 'manifest.json');

  await assertNoSymlinkPath(config.repositoryRoot, manifestPath);
  let manifest = parseAPIManifest(await readJSON(manifestPath));
  const updatedSnapshots = new Map(
    outputs.map(output => [output.targetPath, output.target]),
  );
  const versionGroups = new Map<string, typeof outputs>();

  for (const output of outputs) {
    const key = `${output.packageKey}\u0000${output.version}`;
    const group = versionGroups.get(key) ?? [];

    group.push(output);
    versionGroups.set(key, group);
  }
  for (const group of versionGroups.values()) {
    const first = group[0];

    if (first === undefined) {
      continue;
    }
    const pkg = manifest.packages.find(item => item.key === first.packageKey);
    const version = pkg?.versions.find(item => item.version === first.version);

    if (version === undefined) {
      throw new Error(
        `API manifest does not contain ${first.packageKey}@${first.version}`,
      );
    }
    const dataRoot = path.dirname(config.apiDirectory);

    for (const output of group) {
      const relativePath = version.json[output.locale];

      if (
        relativePath === undefined ||
        resolveManifestSnapshot(dataRoot, relativePath) !== output.targetPath
      ) {
        throw new Error(
          `API manifest path does not match translation target: ${output.targetPath}`,
        );
      }
    }
    const locales = await loadVersionSnapshots(
      config,
      version,
      updatedSnapshots,
      first.apiSnapshot,
    );
    const snapshotHash = contentHash({
      source: first.source,
      metadata: first.apiSnapshot,
      locales,
    });

    manifest = updateManifestSnapshot(
      manifest,
      first.packageKey,
      first.version,
      snapshotHash,
    );
  }

  const updates = new Map<string, string>();

  for (const output of outputs) {
    updates.set(output.targetPath, `${JSON.stringify(output.target)}\n`);
  }
  updates.set(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const staged: StagedFile[] = [];

  try {
    for (const [filename, contents] of updates) {
      await mkdir(path.dirname(filename), { recursive: true });
      staged.push(await stageFile(filename, contents));
    }
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
