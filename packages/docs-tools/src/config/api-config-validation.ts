import { isSafeRelativePath } from '../path-validation';
import { isSafeSlug } from './validation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validatePackageReadme(
  value: unknown,
  prefix: string,
  locales: unknown,
  sourceLocale: unknown,
): string[] {
  if (value === undefined) {
    return [];
  }
  if (!isRecord(value)) {
    return [`${prefix} must be an object`];
  }

  const issues: string[] = [];
  const configuredLocales = Array.isArray(locales)
    ? locales.filter((locale): locale is string => typeof locale === 'string')
    : [];
  const packageSourceLocale = value['sourceLocale'] ?? sourceLocale;
  const files = value['files'];

  if (
    value['sourceLocale'] !== undefined &&
    (typeof value['sourceLocale'] !== 'string' ||
      !configuredLocales.includes(value['sourceLocale']))
  ) {
    issues.push(`${prefix}.sourceLocale must be a configured locale`);
  }
  if (!isRecord(files)) {
    issues.push(`${prefix}.files must map locales to safe paths`);

    return issues;
  }
  for (const [locale, filename] of Object.entries(files)) {
    if (
      !configuredLocales.includes(locale) ||
      typeof filename !== 'string' ||
      !isSafeRelativePath(filename)
    ) {
      issues.push(
        `${prefix}.files.${locale} must be a safe configured-locale path`,
      );
    }
  }
  if (
    typeof packageSourceLocale !== 'string' ||
    !configuredLocales.includes(packageSourceLocale)
  ) {
    issues.push(`${prefix}.sourceLocale must resolve to a configured locale`);
  } else if (typeof files[packageSourceLocale] !== 'string') {
    issues.push(`${prefix}.files must include its source locale`);
  }

  return issues;
}

export function validateAPIConfig(
  value: unknown,
  locales: unknown,
  sourceLocale: unknown,
): string[] {
  if (value === undefined) {
    return [];
  }
  if (!isRecord(value) || typeof value['dataDirectory'] !== 'string') {
    return ['api.dataDirectory must be a string'];
  }

  const issues: string[] = [];

  if (value['packageReadmes'] !== undefined) {
    issues.push(
      'api.packageReadmes must be configured under api.packages[].readme.files',
    );
  }
  if (value['packageReadmeSourceLocales'] !== undefined) {
    issues.push(
      'api.packageReadmeSourceLocales must be configured as api.packages[].readme.sourceLocale',
    );
  }
  const packages = value['packages'];

  if (
    packages !== undefined &&
    (!Array.isArray(packages) || packages.length === 0)
  ) {
    issues.push('api.packages must be a non-empty array');
  } else if (Array.isArray(packages)) {
    const keys = new Set<string>();

    for (const [index, packageConfig] of packages.entries()) {
      if (
        !isRecord(packageConfig) ||
        typeof packageConfig['key'] !== 'string' ||
        !isSafeSlug(packageConfig['key']) ||
        keys.has(packageConfig['key']) ||
        typeof packageConfig['name'] !== 'string' ||
        packageConfig['name'].length === 0 ||
        typeof packageConfig['directory'] !== 'string' ||
        !isSafeRelativePath(packageConfig['directory']) ||
        typeof packageConfig['tsconfig'] !== 'string' ||
        !isSafeRelativePath(packageConfig['tsconfig']) ||
        !Array.isArray(packageConfig['entries']) ||
        packageConfig['entries'].length === 0
      ) {
        issues.push(
          `api.packages[${index}] must declare unique key, name, directory, tsconfig, and entries`,
        );
        continue;
      }
      keys.add(packageConfig['key']);
      issues.push(
        ...validatePackageReadme(
          packageConfig['readme'],
          `api.packages[${index}].readme`,
          locales,
          sourceLocale,
        ),
      );
      const entryKeys = new Set<string>();

      for (const [entryIndex, entry] of packageConfig['entries'].entries()) {
        if (
          !isRecord(entry) ||
          typeof entry['key'] !== 'string' ||
          entry['key'].length === 0 ||
          entryKeys.has(entry['key']) ||
          typeof entry['source'] !== 'string' ||
          !isSafeRelativePath(entry['source']) ||
          typeof entry['types'] !== 'string' ||
          !isSafeRelativePath(entry['types'])
        ) {
          issues.push(
            `api.packages[${index}].entries[${entryIndex}] must declare a unique key, source, and types path`,
          );
          continue;
        }
        entryKeys.add(entry['key']);
      }
    }
  }
  if (
    value['typedocOptions'] !== undefined &&
    !isRecord(value['typedocOptions'])
  ) {
    issues.push('api.typedocOptions must be an object');
  }
  if (
    value['sourceLinkTemplate'] !== undefined &&
    typeof value['sourceLinkTemplate'] !== 'string'
  ) {
    issues.push('api.sourceLinkTemplate must be a string');
  }

  return issues;
}
