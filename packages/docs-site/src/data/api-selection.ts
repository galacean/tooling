import type { APIManifestPackage, APIVersion } from './api-manifest';

export interface APISelection {
  packageKey: string;
  version: string;
  entryKey: string;
  symbol?: string | undefined;
}

export function findAPIVersion(
  pkg: APIManifestPackage | undefined,
  version: string | undefined,
): APIVersion | undefined {
  return version === 'current' ? pkg?.current : pkg?.versions.find(item => item.version === version);
}

export interface APIVersionTarget {
  entryKey: string;
  version: string;
  symbolName: string;
}

export function resolveAPIVersionTarget(
  pkg: APIManifestPackage,
  version: string,
  entryKey: string,
  symbolName: string | undefined,
): APIVersionTarget | undefined {
  const selected = findAPIVersion(pkg, version);
  const entry =
    selected?.entries.find(item => item.key === entryKey) ??
    selected?.entries[0];
  const symbol =
    entry?.symbols.find(item => item.name === symbolName) ?? entry?.symbols[0];

  return entry === undefined || symbol === undefined
    ? undefined
    : { version, entryKey: entry.key, symbolName: symbol.name };
}
