import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseAPIManifest } from '@galacean/docs-site';
import type { APIManifest } from '@galacean/docs-site';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { assertNoSymlinkPath, isWithin } from '../path-validation';
import { readJSON, readOptionalJSON } from './read-json';
import { localizedSnapshotHash } from './snapshot';
import { resolveAPISnapshotReference } from './snapshot-reference';

export type APIVersionState =
  | { status: 'missing' }
  | { status: 'invalid'; reason: string }
  | { status: 'complete' }
  | { status: 'locales-pending'; missingLocales: string[]; extraLocales: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
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

export async function inspectAPIVersionState(
  config: ResolvedDocsBuildConfig,
  version: string,
): Promise<APIVersionState> {
  const apiPackages = config.apiPackages;

  if (apiPackages === undefined || apiPackages.length === 0) {
    return { status: 'invalid', reason: 'No API packages are configured' };
  }
  const manifestPath = path.join(config.apiDirectory, 'manifest.json');
  let manifestValue: unknown;

  try {
    manifestValue = await readOptionalJSON(manifestPath);
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (manifestValue === undefined) {
    return { status: 'missing' };
  }
  let manifest: APIManifest;

  try {
    manifest = parseAPIManifest(manifestValue);
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const presentPackages = manifest.packages.filter(pkg =>
    pkg.versions.some(item => item.version === version),
  );

  if (presentPackages.length === 0) {
    return { status: 'missing' };
  }
  if (presentPackages.length !== apiPackages.length) {
    return {
      status: 'invalid',
      reason: 'API version package set is incomplete',
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

  const firstPackage = apiPackages[0];
  const sourceCommit = firstPackage === undefined
    ? undefined
    : versionFor(manifest, firstPackage.key, version)?.commit;

  if (sourceCommit === undefined || !/^[a-f\d]{40,64}$/iu.test(sourceCommit)) {
    return {
      status: 'invalid',
      reason: `${version} does not have a valid source commit`,
    };
  }

  const dataRoot = path.dirname(config.apiDirectory);
  const expectedSnapshotByLocale = new Map<string, string>();
  const firstVersion = presentPackages[0]!.versions.find(item => item.version === version)!;
  const appliedSnapshots: Record<string, Record<string, unknown>> = {};
  let modelMetadata: string | undefined;
  const missingLocales = new Set<string>();
  const extraLocales = new Set<string>();

  for (const apiPackage of apiPackages) {
    const item = versionFor(manifest, apiPackage.key, version);

    if (item === undefined || item.commit !== sourceCommit) {
      return {
        status: 'invalid',
        reason: `${apiPackage.key}@${version} commit does not match other API packages`,
      };
    }
    if (item.snapshot !== firstVersion.snapshot) {
      return { status: 'invalid', reason: `${apiPackage.key}@${version} snapshot revision differs between packages` };
    }
    const locales = Object.keys(item.json).sort();

    if (!locales.includes(config.sourceLocale)) {
      return { status: 'invalid', reason: `${apiPackage.key}@${version} authoritative source locale is missing` };
    }
    config.locales.filter(locale => !locales.includes(locale)).forEach(locale => missingLocales.add(locale));
    locales.filter(locale => !config.locales.includes(locale)).forEach(locale => extraLocales.add(locale));
    for (const locale of locales) {
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
      const expectedSnapshot = expectedSnapshotByLocale.get(locale);

      if (expectedSnapshot !== undefined && expectedSnapshot !== snapshotPath) {
        return {
          status: 'invalid',
          reason: `${version}/${locale} wrappers do not reference the same API model`,
        };
      }
      if (expectedSnapshot === snapshotPath) {
        continue;
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
        snapshot['apiSnapshot']['commit'] !== item.commit ||
        typeof snapshot['apiSnapshot']['snapshot'] !== 'string' ||
        !/^[a-f\d]{64}$/iu.test(snapshot['apiSnapshot']['snapshot']) ||
        typeof snapshot['apiSnapshot']['generatorVersion'] !== 'string' ||
        snapshot['apiSnapshot']['generatorVersion'].length === 0 ||
        !isUnknownArray(snapshot['apiSnapshot']['packages'])
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
      const metadata = JSON.stringify(snapshot['apiSnapshot']);

      if (modelMetadata !== undefined && modelMetadata !== metadata) {
        return { status: 'invalid', reason: `${version}/${locale} snapshot metadata differs between locales` };
      }
      modelMetadata = metadata;
      if (snapshot['apiSnapshot']['snapshot'] !== item.snapshot) {
        appliedSnapshots[locale] = snapshot;
      }
      expectedSnapshotByLocale.set(locale, snapshotPath);
    }
  }

  const source = appliedSnapshots[config.sourceLocale];

  if (source !== undefined) {
    // api apply records the revision of the localized set in the manifest.
    const snapshots = Object.fromEntries(Object.keys(firstVersion.json).map(locale => [locale, appliedSnapshots[locale]]));

    if (localizedSnapshotHash(source, snapshots) !== firstVersion.snapshot) {
      return { status: 'invalid', reason: `${version} localized snapshot revision is inconsistent` };
    }
  }

  return missingLocales.size > 0 || extraLocales.size > 0
    ? { status: 'locales-pending', missingLocales: [...missingLocales], extraLocales: [...extraLocales] }
    : { status: 'complete' };
}
