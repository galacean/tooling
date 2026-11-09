import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isRecord, parseProject } from '@galacean/docs-site';
import { assertNoSymlinkPath } from '../config/site-config';
import type { DocsSiteConfig } from '../config/site-config';
import { sourceProject } from './snapshot';
import { buildTranslationSource, contentHash } from './translations';
import type { DocumentationPackage, TranslationSource } from './translations';
import { parseVersion } from './versions';
import { readAPISnapshot } from './snapshot-reference';

type ExtractConfig = Pick<
  DocsSiteConfig,
  | 'repositoryRoot'
  | 'sourceLocale'
  | 'locales'
  | 'apiDirectory'
  | 'translationWorkDirectory'
>;

export interface ExtractedTranslationTask {
  taskPath: string;
  targetPath: string;
  packageKey: string;
  version: string;
  locale: string;
  fields: number;
}

export interface TranslationInput {
  locale: string;
  version: string;
  packageKey: string;
  packageName: string;
  sourcePath: string;
  targetPath: string;
  sourceHash: string;
  targetHash: string;
  targetSnapshotPath: string;
  configHash: string;
  fields: { key: string; sourceText: string; tokens: unknown[] }[];
  project: Record<string, unknown>;
  targetProject: Record<string, unknown>;
  apiSnapshot: Record<string, unknown>;
  translationSource: TranslationSource;
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

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export async function loadTranslationInput(
  targetFile: string,
  config: ExtractConfig,
): Promise<TranslationInput> {
  const targetPath = path.resolve(config.repositoryRoot, targetFile);
  const relativePath = path.relative(config.apiDirectory, targetPath);
  const segments = relativePath.split(path.sep);
  const localeMatch = /^([a-z]{2}(?:-[A-Za-z0-9]+)*)\.api\.json$/u.exec(
    path.basename(targetPath),
  );

  if (
    !isWithin(config.apiDirectory, targetPath) ||
    segments.length !== 3 ||
    localeMatch?.[1] === undefined ||
    segments[0] === undefined ||
    segments[1] === undefined
  ) {
    throw new Error(
      `Expected <package-key>/<SemVer>/<locale>.api.json under ${config.apiDirectory}: ${targetFile}`,
    );
  }
  const [packageKey, version] = segments;
  const locale = localeMatch[1];

  parseVersion(version);
  if (locale === config.sourceLocale || !config.locales.includes(locale)) {
    throw new Error(
      `Target locale must be configured and differ from sourceLocale: ${locale}`,
    );
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(packageKey)) {
    throw new Error(`Invalid API package key in snapshot path: ${packageKey}`);
  }

  const sourcePath = path.join(
    path.dirname(targetPath),
    `${config.sourceLocale}.api.json`,
  );

  const dataRoot = path.dirname(config.apiDirectory);
  const [sourceData, targetData] = await Promise.all([
    readAPISnapshot(sourcePath, dataRoot, config.repositoryRoot),
    readAPISnapshot(targetPath, dataRoot, config.repositoryRoot),
  ]);
  const sourceSnapshot = sourceData.value;
  const targetSnapshot = targetData.value;

  if (
    !isRecord(sourceSnapshot) ||
    sourceSnapshot['locale'] !== config.sourceLocale ||
    !isRecord(sourceSnapshot['apiSnapshot'])
  ) {
    throw new Error(`Invalid source API snapshot: ${sourcePath}`);
  }
  const apiSnapshot = sourceSnapshot['apiSnapshot'];
  const packages = apiSnapshot['packages'];

  if (!isUnknownArray(packages)) {
    throw new Error(`Invalid source API snapshot: ${sourcePath}`);
  }
  if (
    !isRecord(targetSnapshot) ||
    targetSnapshot['locale'] !== locale ||
    JSON.stringify(targetSnapshot['apiSnapshot']) !==
      JSON.stringify(sourceSnapshot['apiSnapshot'])
  ) {
    throw new Error(`Target snapshot does not match its source: ${targetPath}`);
  }
  const packageValue = packages.find(
    item => isRecord(item) && item['key'] === packageKey,
  );

  if (
    !isRecord(packageValue) ||
    packageValue['version'] !== version ||
    typeof packageValue['name'] !== 'string' ||
    !Array.isArray(packageValue['entries'])
  ) {
    throw new Error(
      `API package metadata does not match snapshot path: ${packageKey}/${version}`,
    );
  }
  const documentationPackages = (
    packages as unknown as DocumentationPackage[]
  ).filter(pkg => pkg.key === packageKey);
  const project = parseProject<Record<string, unknown>>(
    sourceProject(sourceSnapshot),
    value => typeof value === 'string' && config.locales.includes(value),
  );
  const targetProjectValue = structuredClone(targetSnapshot);

  delete targetProjectValue['locale'];
  delete targetProjectValue['apiSnapshot'];
  const targetProject = parseProject<Record<string, unknown>>(
    targetProjectValue,
    value => typeof value === 'string' && config.locales.includes(value),
  );
  const translationSource = buildTranslationSource(
    project,
    documentationPackages,
    { sourceLocale: config.sourceLocale },
  );
  const relativeTargetPath = path
    .relative(config.apiDirectory, targetPath)
    .split(path.sep)
    .join('/');
  const relativeSourcePath = path
    .relative(config.apiDirectory, sourcePath)
    .split(path.sep)
    .join('/');
  const configHash = contentHash({
    sourceLocale: config.sourceLocale,
    locales: config.locales,
    apiDirectory: path
      .relative(config.repositoryRoot, config.apiDirectory)
      .split(path.sep)
      .join('/'),
  });

  return {
    locale,
    version,
    packageKey,
    packageName: packageValue['name'],
    sourcePath: relativeSourcePath,
    targetPath: relativeTargetPath,
    sourceHash: translationSource.sourceHash,
    targetHash: createHash('sha256').update(targetData.text).digest('hex'),
    targetSnapshotPath: targetData.resolvedPath,
    configHash,
    fields: translationSource.fields
      .filter(field => field.sourceLocale !== locale)
      .map(({ key, sourceText, tokens }) => ({ key, sourceText, tokens })),
    project,
    targetProject,
    apiSnapshot,
    translationSource,
  };
}

export async function extractTranslationTasks(
  targetFiles: string[],
  config: ExtractConfig,
): Promise<ExtractedTranslationTask[]> {
  if (targetFiles.length === 0) {
    throw new Error('Provide one or more API snapshot paths');
  }

  const inputs = await Promise.all(
    targetFiles.map(targetFile => loadTranslationInput(targetFile, config)),
  );
  const seenTargets = new Set<string>();

  for (const input of inputs) {
    if (seenTargets.has(input.targetPath)) {
      throw new Error(`Duplicate target API snapshot: ${input.targetPath}`);
    }
    seenTargets.add(input.targetPath);
    if (input.fields.length === 0) {
      throw new Error(
        `No API comment fields need translation: ${input.targetPath}`,
      );
    }
  }

  await assertNoSymlinkPath(
    config.repositoryRoot,
    config.translationWorkDirectory,
  );
  await mkdir(config.translationWorkDirectory, { recursive: true });
  const runDirectory = await mkdtemp(
    path.join(config.translationWorkDirectory, 'run-'),
  );

  try {
    const tasks: ExtractedTranslationTask[] = [];

    for (const [index, input] of inputs.entries()) {
      const task = {
        schemaVersion: 1,
        sourceLocale: config.sourceLocale,
        locale: input.locale,
        packageKey: input.packageKey,
        packageName: input.packageName,
        version: input.version,
        configHash: input.configHash,
        sourceHash: input.sourceHash,
        targetHash: input.targetHash,
        sourcePath: input.sourcePath,
        targetPath: input.targetPath,
        fields: input.fields,
      };
      const taskPath = path.join(
        runDirectory,
        `${String(index + 1).padStart(3, '0')}.task.json`,
      );

      await writeFile(taskPath, `${JSON.stringify(task, null, 2)}\n`, {
        flag: 'wx',
      });
      tasks.push({
        taskPath,
        targetPath: input.targetPath,
        packageKey: input.packageKey,
        version: input.version,
        locale: input.locale,
        fields: input.fields.length,
      });
    }

    return tasks;
  } catch (error) {
    await rm(runDirectory, { recursive: true, force: true });
    throw error;
  }
}
