import { isRecord } from './typedoc-project.js';

export interface APISymbol {
  name: string;
  id: number;
  kind: number;
}

export interface APIEntry {
  key: string;
  source: string;
  types: string;
  id: number;
  symbols: APISymbol[];
}

export interface APIVersion {
  translatedLocales?: string[];
  version: string;
  snapshot: string;
  commit: string;
  entries: APIEntry[];
  json: Record<string, string>;
}

export interface APIManifestPackage {
  key: string;
  name: string;
  latestVersion: string;
  entries: APIEntry[];
  current: APIVersion & { packageVersion: string };
  versions: APIVersion[];
}

export interface APIManifest {
  schemaVersion: number;
  defaultVersion: string;
  packages: APIManifestPackage[];
}

type SymbolNames = readonly Pick<APISymbol, 'name'>[];

function disambiguateSymbol(symbolName: string): string {
  const identity = [...symbolName]
    .map(character => character.codePointAt(0)?.toString(16) ?? '')
    .join('-');

  return `${symbolName}--${identity}`;
}

/** Index each entry once while resolving links from a single manifest snapshot. */
export function createAPISymbolRouteLookup() {
  const entries = new WeakMap<SymbolNames, Set<string>>();

  return (symbols: SymbolNames, name: string): string => {
    let collisions = entries.get(symbols);

    if (collisions === undefined) {
      collisions = new Set<string>();
      const seen = new Set<string>();

      for (const symbol of symbols) {
        const folded = symbol.name.toLocaleLowerCase('en-US');

        if (seen.has(folded)) {
          collisions.add(folded);
        }
        seen.add(folded);
      }
      entries.set(symbols, collisions);
    }

    return collisions.has(name.toLocaleLowerCase('en-US')) ? disambiguateSymbol(name) : name;
  };
}

export function getAPISymbolRouteSegment(symbols: SymbolNames, symbolName: string): string {
  return createAPISymbolRouteLookup()(symbols, symbolName);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every(item => typeof item === 'string')
  );
}

function isSafeDataPath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    value
      .split('/')
      .every(segment => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function isSymbol(value: unknown): value is APISymbol {
  return (
    isRecord(value) &&
    typeof value['name'] === 'string' &&
    value['name'].length > 0 &&
    typeof value['id'] === 'number' &&
    Number.isInteger(value['id']) &&
    typeof value['kind'] === 'number' &&
    Number.isInteger(value['kind'])
  );
}

function isEntry(value: unknown): value is APIEntry {
  return (
    isRecord(value) &&
    typeof value['key'] === 'string' &&
    value['key'].length > 0 &&
    typeof value['source'] === 'string' &&
    value['source'].length > 0 &&
    typeof value['types'] === 'string' &&
    value['types'].length > 0 &&
    typeof value['id'] === 'number' &&
    Number.isInteger(value['id']) &&
    Array.isArray(value['symbols']) &&
    value['symbols'].every(isSymbol) &&
    new Set(value['symbols'].map(symbol => symbol.name)).size ===
      value['symbols'].length
  );
}

function isVersion(value: unknown): value is APIVersion {
  return (
    isRecord(value) &&
    typeof value['version'] === 'string' &&
    value['version'].length > 0 &&
    typeof value['snapshot'] === 'string' &&
    /^[a-f\d]{64}$/u.test(value['snapshot']) &&
    typeof value['commit'] === 'string' &&
    value['commit'].length > 0 &&
    Array.isArray(value['entries']) &&
    value['entries'].every(isEntry) &&
    new Set(value['entries'].map(entry => entry.key)).size ===
      value['entries'].length &&
    (value['translatedLocales'] === undefined || (Array.isArray(value['translatedLocales']) && value['translatedLocales'].every(locale => typeof locale === 'string' && isRecord(value['json']) && Object.hasOwn(value['json'], locale)))) &&
    isStringRecord(value['json']) &&
    Object.values(value['json']).every(isSafeDataPath)
  );
}

function sameEntries(left: APIEntry[], right: APIEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const candidate = right[index];

      return (
        candidate !== undefined &&
        entry.key === candidate.key &&
        entry.source === candidate.source &&
        entry.types === candidate.types &&
        entry.id === candidate.id &&
        entry.symbols.length === candidate.symbols.length &&
        entry.symbols.every((symbol, symbolIndex) => {
          const candidateSymbol = candidate.symbols[symbolIndex];

          return (
            candidateSymbol !== undefined &&
            symbol.name === candidateSymbol.name &&
            symbol.id === candidateSymbol.id &&
            symbol.kind === candidateSymbol.kind
          );
        })
      );
    })
  );
}

function sameStringRecord(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && left[key] === right[key],
    )
  );
}

function isManifestPackage(value: unknown): value is APIManifestPackage {
  if (
    !isRecord(value) ||
    typeof value['key'] !== 'string' ||
    value['key'].length === 0 ||
    typeof value['name'] !== 'string' ||
    value['name'].length === 0 ||
    typeof value['latestVersion'] !== 'string' ||
    !Array.isArray(value['entries']) ||
    !value['entries'].every(isEntry) ||
    !Array.isArray(value['versions']) ||
    !value['versions'].every(isVersion)
  ) {
    return false;
  }

  const current = value['current'];

  if (
    !isRecord(current) ||
    !isVersion(current) ||
    current['version'] !== 'current' ||
    typeof current['packageVersion'] !== 'string' ||
    current['packageVersion'] !== value['latestVersion']
  ) {
    return false;
  }
  const versions = value['versions'];
  const latest = versions.find(
    version => version.version === value['latestVersion'],
  );
  const entries = value['entries'];

  return (
    latest !== undefined &&
    sameEntries(entries, latest.entries) &&
    sameEntries(current.entries, latest.entries) &&
    current.snapshot === latest.snapshot &&
    current.commit === latest.commit &&
    sameStringRecord(current.json, latest.json) &&
    new Set(versions.map(version => version.version)).size === versions.length
  );
}

export function parseAPIManifest(value: unknown): APIManifest {
  if (
    !isRecord(value) ||
    typeof value['schemaVersion'] !== 'number' ||
    !Number.isInteger(value['schemaVersion']) ||
    value['schemaVersion'] < 1 ||
    typeof value['defaultVersion'] !== 'string' ||
    value['defaultVersion'].length === 0 ||
    !Array.isArray(value['packages']) ||
    value['packages'].length > 100 ||
    !value['packages'].every(isManifestPackage) ||
    new Set(value['packages'].map(pkg => pkg.key)).size !==
      value['packages'].length
  ) {
    throw new Error('Invalid API manifest');
  }

  return value as unknown as APIManifest;
}
