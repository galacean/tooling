import { synchronizeAPILocales } from './locales';
import { randomUUID } from 'node:crypto';
import { cp, link, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseAPIManifest } from '@galacean/docs-site';
import type { APIManifest } from '@galacean/docs-site';
import { assertNoSymlinkPath } from '../path-validation';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { assembleAPIDocumentation } from './assemble';
import type { APIDocumentationMetadata } from './assemble';
import { getErrorCode, readJSON, readOptionalJSON } from './read-json';
import { inspectAPIVersionState } from './versioned-state';
import type { APIVersionState } from './versioned-state';
import {
  compareVersions,
  parseAPIVersionManifest,
} from './versions';

export interface BuiltAPIVersion {
  metadata: APIDocumentationMetadata;
  project: Record<string, unknown>;
}

export type APIVersionBuilder = (
  config: ResolvedDocsBuildConfig,
  version: string,
  repository: string,
  source: 'tag' | 'current',
) => Promise<BuiltAPIVersion>;

export interface VersionedGenerationResult {
  packages: number;
  exports: number;
  warnings: string[];
  versionStatuses: {
    version: string;
    status: APIVersionState['status'];
    reason?: string;
  }[];
}

export interface APIGenerationOptions {
  version?: string;
  force?: boolean;
}

async function listFiles(
  directory: string,
  prefix = '',
): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const files: string[] = [];

  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    const filename = path.join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`Symlink in staged API data is not allowed: ${filename}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(filename, relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }

  return files;
}

async function writeAtomic(filename: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;

  await writeFile(temporary, contents, { flag: 'wx' });
  await rename(temporary, filename);
}

async function publishImmutableFile(
  source: string,
  target: string,
): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await link(source, target);
  } catch (error) {
    if (getErrorCode(error) !== 'EEXIST') {
      throw error;
    }
    const [existing, staged] = await Promise.all([
      readFile(target),
      readFile(source),
    ]);

    if (!existing.equals(staged)) {
      throw new Error(`Refusing to overwrite existing API data: ${target}`, {
        cause: error,
      });
    }
  }
}

function latestVersion(manifest: APIManifest, versions: string[]): APIManifest {
  const currentVersion = [...versions].sort(compareVersions).at(-1);

  if (
    currentVersion === undefined ||
    manifest.packages.some(pkg =>
      !pkg.versions.some(item => item.version === currentVersion),
    )
  ) {
    return manifest;
  }
  const packages = manifest.packages.map(pkg => {
    const latest = pkg.versions.find(item => item.version === currentVersion);

    if (latest === undefined) {
      throw new Error(
        `API package ${pkg.key} does not contain configured current version ${currentVersion}`,
      );
    }

    return {
      ...pkg,
      latestVersion: currentVersion,
      entries: latest.entries,
      current: { ...latest, version: 'current' as const, packageVersion: currentVersion },
    };
  });

  return parseAPIManifest({ ...manifest, packages });
}

function validateBuiltVersion(
  config: ResolvedDocsBuildConfig,
  version: string,
  built: BuiltAPIVersion,
): void {
  const configuredPackages = config.apiPackages ?? [];

  if (
    !/^[a-f\d]{40,64}$/iu.test(built.metadata.commit) ||
    built.metadata.generatorVersion.length === 0 ||
    built.metadata.packages.length !== configuredPackages.length
  ) {
    throw new Error(`Invalid generated API metadata for ${version}`);
  }
  for (const configuredPackage of configuredPackages) {
    const generatedPackage = built.metadata.packages.find(
      item => item.key === configuredPackage.key,
    );

    if (
      generatedPackage === undefined ||
      generatedPackage.name !== configuredPackage.name ||
      generatedPackage.version !== version
    ) {
      throw new Error(
        `Generated API package set or version mismatch: ${configuredPackage.key}@${version}`,
      );
    }
  }
}

function sourceRoot(config: ResolvedDocsBuildConfig, apiDirectory: string): ResolvedDocsBuildConfig {
  return { ...config, apiDirectory };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function currentWorkspaceVersion(
  config: ResolvedDocsBuildConfig,
  configuredVersions: string[],
): Promise<string | undefined> {
  const packages = config.apiPackages ?? [];
  let version: string | undefined;

  for (const packageConfig of packages) {
    const manifest = await readOptionalJSON(
      path.join(packageConfig.directory, 'package.json'),
    );

    if (
      !isRecord(manifest) ||
      typeof manifest['version'] !== 'string'
    ) {
      return undefined;
    }
    if (!configuredVersions.includes(manifest['version'])) {
      return undefined;
    }
    if (manifest['name'] !== packageConfig.name) {
      throw new Error(
        `Package manifest does not match configured API package: ${packageConfig.key}`,
      );
    }
    if (version !== undefined && version !== manifest['version']) {
      return undefined;
    }
    version = manifest['version'];
  }

  return version;
}

export async function generateVersionedAPIDocumentation(
  config: ResolvedDocsBuildConfig,
  selectedPackageKeys: string[],
  buildVersion: APIVersionBuilder,
  reportStatus?: (status: {
    version: string;
    status: APIVersionState['status'];
    reason?: string;
  }) => void,
  options: APIGenerationOptions = {},
): Promise<VersionedGenerationResult> {
  const packageKeys = config.apiPackages?.map(pkg => pkg.key) ?? [];

  if (packageKeys.length === 0) {
    throw new Error('site config must declare api.packages before API generation');
  }
  if (
    selectedPackageKeys.length !== packageKeys.length ||
    packageKeys.some(key => !selectedPackageKeys.includes(key))
  ) {
    throw new Error(
      'Versioned API generation must include every configured package',
    );
  }
  if (config.apiVersions === undefined) {
    throw new Error('site config must declare api.versions for versioned API generation');
  }
  const versionManifest = parseAPIVersionManifest(config.apiVersions);
  const versions = [...versionManifest.versions].sort(compareVersions);
  const selectedVersion = options.version ?? versions.at(-1);

  if (selectedVersion === undefined || !versions.includes(selectedVersion)) {
    throw new Error(
      `API version is not configured: ${selectedVersion ?? '(none)'}`,
    );
  }
  const warnings: string[] = [];
  const currentVersion = await currentWorkspaceVersion(
    config,
    versionManifest.versions,
  );
  const versionStates = await Promise.all(
    [selectedVersion].map(async version => {
      try {
        let state = await inspectAPIVersionState(config, version);

        if (state.status === 'locales-pending') {
          const result = await synchronizeAPILocales(config, version);

          warnings.push(...result.warnings);
          state = { status: 'complete' };
        }

        return {
          version,
          state:
            options.force === true && state.status === 'complete'
              ? { status: 'missing' as const }
              : state,
        };
      } catch (error) {
        return {
          version,
          state: {
            status: 'invalid' as const,
            reason: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }),
  );

  for (const { version, state } of versionStates) {
    reportStatus?.({
      version,
      status: state.status,
      ...(state.status === 'invalid' ? { reason: state.reason } : {}),
    });
  }

  const invalid = versionStates.filter(item => item.state.status === 'invalid');

  if (invalid.length > 0) {
    throw new Error(
      `Invalid API versions: ${versionStates.map(item => `${item.version}: ${item.state.status}${item.state.status === 'invalid' ? ` (${item.state.reason})` : ''}`).join('; ')}`,
    );
  }
  const missingVersions = versionStates
    .filter(item => item.state.status === 'missing')
    .map(item => item.version)
    .sort(compareVersions);
  const builds: { version: string; built: BuiltAPIVersion }[] = [];

  for (const version of missingVersions) {
    const built = await buildVersion(
      config,
      version,
      versionManifest.repository,
      version === currentVersion ? 'current' : 'tag',
    );

    validateBuiltVersion(config, version, built);
    builds.push({
      version,
      built,
    });
  }

  if (builds.length > 0) {
    const buildRoot = path.join(
      config.repositoryRoot,
      'tmp/docs-tools/api-build',
    );

    await mkdir(buildRoot, { recursive: true });
    const stagingRoot = await mkdtemp(path.join(buildRoot, 'assembly-'));
    const stagedAPIDirectory = path.join(stagingRoot, 'data/api');

    try {
      await mkdir(path.dirname(stagedAPIDirectory), { recursive: true });
      try {
        await listFiles(config.apiDirectory);
        await cp(config.apiDirectory, stagedAPIDirectory, { recursive: true, errorOnExist: true });
      } catch (error) {
        if (getErrorCode(error) !== 'ENOENT') {
          throw error;
        }
      }
      const stagedConfig = sourceRoot(config, stagedAPIDirectory);
      const stagedManifestPath = path.join(stagedAPIDirectory, 'manifest.json');
      const previousManifestValue = await readOptionalJSON(stagedManifestPath);
      const previousManifest = previousManifestValue === undefined
        ? undefined
        : parseAPIManifest(previousManifestValue);

      await rm(path.join(stagedAPIDirectory, 'version-sources.json'), {
        force: true,
      });

      for (const { version, built } of builds) {
        for (const pkg of previousManifest?.packages ?? []) {
          const previous = pkg.versions.find(item => item.version === version);

          if (previous !== undefined && previous.commit !== built.metadata.commit) {
            throw new Error(
              `API version ${version} already maps to a different commit`,
            );
          }
        }
        const assembled = await assembleAPIDocumentation(
          built.project,
          built.metadata,
          stagedConfig,
          packageKeys,
        );

        warnings.push(...assembled.warnings);
      }
      const stagedManifest = latestVersion(
        parseAPIManifest(await readJSON(stagedManifestPath)),
        versions,
      );
      const stagedFiles = await listFiles(stagedAPIDirectory);
      const immutableFiles = stagedFiles.filter(filename => filename !== 'manifest.json');
      const snapshots = immutableFiles.filter(filename =>
        filename.startsWith('snapshots' + path.sep),
      );
      const wrappers = immutableFiles.filter(filename => !snapshots.includes(filename));

      for (const relativePath of [...snapshots, ...wrappers]) {
        const stagedPath = path.join(stagedAPIDirectory, relativePath);
        const targetPath = path.join(config.apiDirectory, relativePath);

        await assertNoSymlinkPath(config.repositoryRoot, targetPath);
        await publishImmutableFile(stagedPath, targetPath);
      }
      const manifestPath = path.join(config.apiDirectory, 'manifest.json');

      await assertNoSymlinkPath(config.repositoryRoot, manifestPath);
      await writeAtomic(manifestPath, `${JSON.stringify(stagedManifest, null, 2)}\n`);
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  } else {
    const manifestPath = path.join(config.apiDirectory, 'manifest.json');
    const manifestValue = await readOptionalJSON(manifestPath);

    if (manifestValue === undefined) {
      throw new Error('Complete API versions require an API manifest');
    }
    const manifest = parseAPIManifest(manifestValue);
    const normalized = latestVersion(manifest, versionManifest.versions);

    if (JSON.stringify(normalized) !== JSON.stringify(manifest)) {
      await assertNoSymlinkPath(config.repositoryRoot, manifestPath);
      await writeAtomic(manifestPath, `${JSON.stringify(normalized, null, 2)}\n`);
    }
  }

  const legacySourcesPath = path.join(config.apiDirectory, 'version-sources.json');

  await assertNoSymlinkPath(config.repositoryRoot, legacySourcesPath);
  await rm(legacySourcesPath, { force: true });

  const latest = selectedVersion;
  const latestManifestValue = await readOptionalJSON(
    path.join(config.apiDirectory, 'manifest.json'),
  );
  const latestManifest = latestManifestValue === undefined
    ? undefined
    : parseAPIManifest(latestManifestValue);
  const exportCount = latestManifest?.packages
    .flatMap(pkg => pkg.versions.find(item => item.version === latest)?.entries ?? [])
    .reduce((count, entry) => count + entry.symbols.length, 0) ?? 0;

  const finalStates = await Promise.all(
    [selectedVersion].map(async version => ({
      version,
      state: await inspectAPIVersionState(config, version),
    })),
  );
  const incomplete = finalStates.filter(item => item.state.status !== 'complete');

  if (incomplete.length > 0) {
    throw new Error(
      `API versions remain incomplete after generation: ${incomplete.map(item => `${item.version}: ${item.state.status === 'invalid' ? item.state.reason : item.state.status}`).join('; ')}`,
    );
  }

  return {
    packages: packageKeys.length,
    exports: exportCount,
    warnings,
    versionStatuses: versionStates.map(({ version, state }) => ({
      version,
      status: state.status,
      ...(state.status === 'invalid' ? { reason: state.reason } : {}),
    })),
  };
}
