import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseAPIManifest } from '@galacean/docs-site';
import type { APIManifest } from '@galacean/docs-site';
import type { DocsSiteConfig } from '../config/site-config';
import { assertNoSymlinkPath } from '../config/site-config';
import { readJSON, readOptionalJSON } from './read-json';
import { resolveAPISnapshotReference } from './snapshot-reference';
import { parseVersion } from './versions';

export interface APIVersionSource {
  version: string;
  commit: string;
  generatorVersion: string;
  typeDocVersion: string;
  typescriptVersion: string;
}

export interface APIVersionSources {
  schemaVersion: 1;
  versions: APIVersionSource[];
}

export type APIVersionState =
  | { status: 'missing' }
  | { status: 'invalid'; reason: string }
  | { status: 'complete'; source: APIVersionSource };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function parseVersionSources(value: unknown): APIVersionSources {
  if (
    !isRecord(value) ||
    value['schemaVersion'] !== 1 ||
    !Array.isArray(value['versions'])
  ) {
    throw new Error('Invalid API version sources manifest');
  }
  const seen = new Set<string>();
  const versions = value['versions'].map((source, index) => {
    if (
      !isRecord(source) ||
      typeof source['version'] !== 'string' ||
      typeof source['commit'] !== 'string' ||
      !/^[a-f\d]{40,64}$/iu.test(source['commit']) ||
      typeof source['generatorVersion'] !== 'string' ||
      source['generatorVersion'].length === 0 ||
      typeof source['typeDocVersion'] !== 'string' ||
      source['typeDocVersion'].length === 0 ||
      typeof source['typescriptVersion'] !== 'string' ||
      source['typescriptVersion'].length === 0
    ) {
      throw new Error(`Invalid API version source entry: versions[${index}]`);
    }
    parseVersion(source['version']);
    if (seen.has(source['version'])) {
      throw new Error(`Duplicate API version source: ${source['version']}`);
    }
    seen.add(source['version']);

    return source as unknown as APIVersionSource;
  });

  return { schemaVersion: 1, versions };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string');
}

function versionFor(
  manifest: APIManifest,
  packageKey: string,
  version: string,
) {
  return manifest.packages
    .find(pkg => pkg.key === packageKey)
    ?.versions.find(item => item.version === version);
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export async function inspectAPIVersionState(
  config: DocsSiteConfig,
  version: string,
): Promise<APIVersionState> {
  const apiPackages = config.apiPackages;

  if (apiPackages === undefined || apiPackages.length === 0) {
    return { status: 'invalid', reason: 'No API packages are configured' };
  }
  const manifestPath = path.join(config.apiDirectory, 'manifest.json');
  const sourcesPath = path.join(config.apiDirectory, 'version-sources.json');
  let manifestValue: unknown;
  let sourcesValue: unknown;

  try {
    [manifestValue, sourcesValue] = await Promise.all([
      readOptionalJSON(manifestPath),
      readOptionalJSON(sourcesPath),
    ]);
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (manifestValue === undefined && sourcesValue === undefined) {
    return { status: 'missing' };
  }
  let manifest: APIManifest;
  let sources: APIVersionSources;

  try {
    if (manifestValue === undefined || sourcesValue === undefined) {
      throw new Error('API manifest and version-sources.json must exist together');
    }
    manifest = parseAPIManifest(manifestValue);
    sources = parseVersionSources(sourcesValue);
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const source = sources.versions.find(item => item.version === version);
  const presentPackages = manifest.packages.filter(pkg =>
    pkg.versions.some(item => item.version === version),
  );

  if (presentPackages.length === 0) {
    return { status: 'missing' };
  }
  if (source === undefined || presentPackages.length !== apiPackages.length) {
    return {
      status: 'invalid',
      reason: 'Version source audit or package set is incomplete',
    };
  }
  if (
    manifest.packages.length !== apiPackages.length ||
    apiPackages.some(
      apiPackage =>
        !manifest.packages.some(
          pkg => pkg.key === apiPackage.key && pkg.name === apiPackage.name,
        ),
    )
  ) {
    return {
      status: 'invalid',
      reason: 'API manifest package set does not match api.packages',
    };
  }

  const dataRoot = path.dirname(config.apiDirectory);
  let expectedSnapshotByLocale = new Map<string, string>();

  for (const apiPackage of apiPackages) {
    const item = versionFor(manifest, apiPackage.key, version);

    if (item === undefined || item.commit !== source.commit) {
      return {
        status: 'invalid',
        reason: `${apiPackage.key}@${version} commit does not match version-sources.json`,
      };
    }
    const locales = Object.keys(item.json).sort();

    if (JSON.stringify(locales) !== JSON.stringify([...config.locales].sort())) {
      return {
        status: 'invalid',
        reason: `${apiPackage.key}@${version} locales do not match site config`,
      };
    }
    for (const locale of config.locales) {
      const wrapperRelativePath = item.json[locale] ?? '';
      const expectedWrapperPath =
        `api/${apiPackage.key}/${version}/${locale}.api.json`;

      if (wrapperRelativePath !== expectedWrapperPath) {
        return {
          status: 'invalid',
          reason: `${apiPackage.key}@${version}/${locale} wrapper path does not match the configured layout`,
        };
      }
      const wrapperPath = path.resolve(dataRoot, wrapperRelativePath);

      if (!isWithin(dataRoot, wrapperPath)) {
        return {
          status: 'invalid',
          reason: `${apiPackage.key}@${version}/${locale} wrapper path escapes API data`,
        };
      }
      await assertNoSymlinkPath(config.repositoryRoot, wrapperPath);
      let wrapper: unknown;

      try {
        wrapper = await readJSON(wrapperPath);
      } catch (error) {
        return {
          status: 'invalid',
          reason: `${apiPackage.key}@${version}/${locale} wrapper is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      const snapshotPath = resolveAPISnapshotReference(dataRoot, wrapper);

      if (snapshotPath === undefined) {
        return {
          status: 'invalid',
          reason: `${apiPackage.key}@${version}/${locale} wrapper is not a $ref`,
        };
      }
      const expectedSnapshotRelativePath =
        `api/snapshots/${path.basename(snapshotPath)}`;

      if (path.relative(dataRoot, snapshotPath) !== expectedSnapshotRelativePath) {
        return {
          status: 'invalid',
          reason: `${apiPackage.key}@${version}/${locale} snapshot path does not use content addressing`,
        };
      }
      await assertNoSymlinkPath(config.repositoryRoot, snapshotPath);
      const snapshotHash = path.basename(snapshotPath).replace(/\.api\.json$/u, '');
      let snapshotText: string;

      try {
        snapshotText = await readFile(snapshotPath, 'utf8');
      } catch (error) {
        return {
          status: 'invalid',
          reason: `${apiPackage.key}@${version}/${locale} snapshot is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      if (
        !/^[a-f\d]{64}$/iu.test(snapshotHash) ||
        createHash('sha256').update(snapshotText).digest('hex') !== snapshotHash
      ) {
        return {
          status: 'invalid',
          reason: `${apiPackage.key}@${version}/${locale} snapshot hash is invalid`,
        };
      }
      let snapshot: unknown;

      try {
        snapshot = JSON.parse(snapshotText) as unknown;
      } catch {
        return {
          status: 'invalid',
          reason: `${apiPackage.key}@${version}/${locale} snapshot is invalid JSON`,
        };
      }
      if (
        !isRecord(snapshot) ||
        snapshot['locale'] !== locale ||
        !isRecord(snapshot['apiSnapshot']) ||
        snapshot['apiSnapshot']['commit'] !== source.commit ||
        snapshot['apiSnapshot']['snapshot'] !== item.snapshot ||
        snapshot['apiSnapshot']['generatorVersion'] !== source.typeDocVersion ||
        !isUnknownArray(snapshot['apiSnapshot']['packages']) ||
        !isStringRecord(item.json)
      ) {
        return {
          status: 'invalid',
          reason: `${apiPackage.key}@${version}/${locale} snapshot metadata is inconsistent`,
        };
      }
      const snapshotPackages = snapshot['apiSnapshot']['packages'];

      if (
        snapshotPackages.length !== apiPackages.length ||
        apiPackages.some(apiPackage => {
          const snapshotPackage = snapshotPackages.find(
            item => isRecord(item) && item['key'] === apiPackage.key,
          );

          return (
            !isRecord(snapshotPackage) ||
            snapshotPackage['key'] !== apiPackage.key ||
            snapshotPackage['name'] !== apiPackage.name ||
            snapshotPackage['version'] !== version ||
            !Array.isArray(snapshotPackage['entries']) ||
            JSON.stringify(snapshotPackage['entries']) !==
              JSON.stringify(versionFor(manifest, apiPackage.key, version)?.entries)
          );
        })
      ) {
        return {
          status: 'invalid',
          reason: `${apiPackage.key}@${version}/${locale} snapshot package model is inconsistent`,
        };
      }
      const expectedSnapshot = expectedSnapshotByLocale.get(locale);

      if (expectedSnapshot !== undefined && expectedSnapshot !== snapshotPath) {
        return {
          status: 'invalid',
          reason: `${version}/${locale} wrappers do not reference the same API model`,
        };
      }
      expectedSnapshotByLocale.set(locale, snapshotPath);
    }
  }

  return { status: 'complete', source };
}

export async function readAPIVersionSources(
  config: DocsSiteConfig,
): Promise<APIVersionSources | undefined> {
  const value = await readOptionalJSON(
    path.join(config.apiDirectory, 'version-sources.json'),
  );

  return value === undefined ? undefined : parseVersionSources(value);
}
