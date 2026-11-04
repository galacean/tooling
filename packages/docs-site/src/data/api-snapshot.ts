import { buildReflectionIndex } from './api-reflection-index';
import type {
  DocumentationPackage,
  ReflectionIndex,
} from './api-reflection-index';
import { isRecord, parseProject } from './typedoc-project';
import type { APIManifestPackage, APIVersion } from './api-manifest';

export interface ParsedAPISnapshot<
  TProject extends object,
  TReflection extends object,
> {
  project: TProject;
  index: ReflectionIndex<TReflection>;
}

type SnapshotPackage = DocumentationPackage & { version: string };

function isSnapshotPackage(value: unknown): value is SnapshotPackage {
  return (
    isRecord(value) &&
    typeof value['key'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['version'] === 'string' &&
    Array.isArray(value['entries']) &&
    value['entries'].every(
      entry =>
        isRecord(entry) &&
        typeof entry['key'] === 'string' &&
        Array.isArray(entry['symbols']) &&
        entry['symbols'].every(
          symbol =>
            isRecord(symbol) &&
            typeof symbol['name'] === 'string' &&
            typeof symbol['id'] === 'number' &&
            Number.isInteger(symbol['id']) &&
            typeof symbol['kind'] === 'number',
        ),
    )
  );
}

export function parseAPISnapshot<
  TLocale extends string,
  TProject extends object,
  TReflection extends object,
>(
  raw: unknown,
  locale: TLocale,
  info: APIVersion,
  current: boolean,
  available: Pick<APIManifestPackage, 'key' | 'versions'>[],
  isLocale: (value: unknown) => value is TLocale,
  getSymbolURL: (
    locale: string,
    packageKey: string,
    version: string,
    symbol: string,
    entry: string,
    hash: string,
  ) => string,
): ParsedAPISnapshot<TProject, TReflection> {
  if (
    !isRecord(raw) ||
    raw['locale'] !== locale ||
    !isRecord(raw['apiSnapshot']) ||
    raw['apiSnapshot']['commit'] !== info.commit ||
    !Array.isArray(raw['apiSnapshot']['packages']) ||
    !raw['apiSnapshot']['packages'].every(isSnapshotPackage)
  ) {
    throw new Error('Invalid localized API snapshot');
  }
  const project = parseProject<TProject>(raw, isLocale);
  const packages = raw['apiSnapshot']['packages'].filter(
    pkg =>
      current ||
      available.some(
        item =>
          item.key === pkg.key &&
          item.versions.some(
            version =>
              version.version === pkg.version &&
              version.snapshot === info.snapshot,
          ),
      ),
  );

  return {
    project,
    index: buildReflectionIndex<TReflection>(
      project,
      packages,
      (locale, packageKey, packageVersion, symbol, entry, hash) =>
        getSymbolURL(locale, packageKey, packageVersion, symbol, entry, hash),
    ),
  };
}
