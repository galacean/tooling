import { isSafeRelativePath } from '../path-validation';
import { isSafeSlug } from './validation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidNamespace(value: string): boolean {
  return (
    value.split('/').length === 2 &&
    value.split('/').every(part => /^[a-zA-Z0-9_-]+$/u.test(part))
  );
}

function isValidBaseURL(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      ['http:', 'https:'].includes(url.protocol) &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0
    );
  } catch {
    return false;
  }
}

export function validateManualCollections(
  value: unknown,
  locales: unknown,
): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return ['manual.collections must be an array'];
  }
  const issues: string[] = [];
  const supportedLocales = Array.isArray(locales)
    ? locales.filter((locale): locale is string => typeof locale === 'string')
    : [];
  const keys = new Set<string>();

  for (const [index, item] of value.entries()) {
    const prefix = `manual.collections[${index}]`;

    if (
      !isRecord(item) ||
      typeof item['key'] !== 'string' ||
      !isSafeSlug(item['key']) ||
      keys.has(item['key']) ||
      !isRecord(item['source'])
    ) {
      issues.push(`${prefix} must declare a unique key and source`);
      continue;
    }
    keys.add(item['key']);
    if (
      item['routePrefix'] !== undefined &&
      (typeof item['routePrefix'] !== 'string' ||
        !isSafeSlug(item['routePrefix']))
    ) {
      issues.push(`${prefix}.routePrefix must be a safe route slug`);
    }

    const source = item['source'];

    if (
      typeof source['locale'] !== 'string' ||
      !supportedLocales.includes(source['locale'])
    ) {
      issues.push(`${prefix}.source.locale must be a configured locale`);
    }
    if (source['type'] === 'local') {
      if (
        typeof source['directory'] !== 'string' ||
        !isSafeRelativePath(source['directory'])
      ) {
        issues.push(`${prefix}.source.directory must be a safe relative path`);
      }
    } else if (source['type'] === 'yuque') {
      if (
        typeof source['baseURL'] !== 'string' ||
        !isValidBaseURL(source['baseURL'])
      ) {
        issues.push(`${prefix}.source.baseURL must be an HTTP(S) URL`);
      }
      if (
        typeof source['tokenEnv'] !== 'string' ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(source['tokenEnv'])
      ) {
        issues.push(
          `${prefix}.source.tokenEnv must be an environment variable name`,
        );
      }
      if (source['mode'] === 'repo') {
        if (
          typeof source['namespace'] !== 'string' ||
          !isValidNamespace(source['namespace'])
        ) {
          issues.push(
            `${prefix}.source.namespace must be a group/book namespace`,
          );
        }
      } else if (source['mode'] === 'documents') {
        if (
          !Array.isArray(source['documents']) ||
          source['documents'].length === 0
        ) {
          issues.push(`${prefix}.source.documents must be a non-empty array`);
        } else {
          for (const [documentIndex, document] of source[
            'documents'
          ].entries()) {
            if (
              !isRecord(document) ||
              typeof document['namespace'] !== 'string' ||
              !isValidNamespace(document['namespace']) ||
              typeof document['slug'] !== 'string' ||
              !isSafeSlug(document['slug']) ||
              typeof document['routeSlug'] !== 'string' ||
              !isSafeSlug(document['routeSlug']) ||
              (document['group'] !== undefined &&
                typeof document['group'] !== 'string') ||
              (document['docId'] !== undefined &&
                typeof document['docId'] !== 'string')
            ) {
              issues.push(
                `${prefix}.source.documents[${documentIndex}] must declare namespace, slug, routeSlug, and optional group/docId`,
              );
            }
          }
        }
      } else {
        issues.push(`${prefix}.source.mode must be repo or documents`);
      }
    } else {
      issues.push(`${prefix}.source.type must be local or yuque`);
    }

    if (item['ignore'] !== undefined) {
      const ignore = item['ignore'];

      if (!isRecord(ignore)) {
        issues.push(`${prefix}.ignore must be an object`);
      } else {
        if (
          (ignore['slugs'] !== undefined ||
            ignore['titleContains'] !== undefined) &&
          !(source['type'] === 'yuque' && source['mode'] === 'repo')
        ) {
          issues.push(
            `${prefix}.ignore.slugs and titleContains require Yuque repo mode`,
          );
        }
        if (
          ignore['documentRefs'] !== undefined &&
          !(source['type'] === 'yuque' && source['mode'] === 'documents')
        ) {
          issues.push(
            `${prefix}.ignore.documentRefs require Yuque documents mode`,
          );
        }
        if (source['type'] === 'local' && ignore['docIds'] !== undefined) {
          issues.push(
            `${prefix}.ignore.docIds are not supported for local sources`,
          );
        }
        for (const selector of ['docIds', 'slugs', 'titleContains'] as const) {
          const entries = ignore[selector];

          if (
            entries !== undefined &&
            (!Array.isArray(entries) ||
              entries.some(entry => typeof entry !== 'string'))
          ) {
            issues.push(`${prefix}.ignore.${selector} must be a string array`);
          }
        }
        const refs = ignore['documentRefs'];

        if (
          refs !== undefined &&
          (!Array.isArray(refs) ||
            refs.some(
              ref =>
                !isRecord(ref) ||
                typeof ref['namespace'] !== 'string' ||
                !isValidNamespace(ref['namespace']) ||
                typeof ref['slug'] !== 'string' ||
                !isSafeSlug(ref['slug']),
            ))
        ) {
          issues.push(
            `${prefix}.ignore.documentRefs must contain namespace/slug references`,
          );
        }
      }
    }
    if (item['translations'] !== undefined) {
      const translations = item['translations'];

      if (!isRecord(translations)) {
        issues.push(`${prefix}.translations must map locales to safe paths`);
      } else if (
        Object.entries(translations).some(
          ([locale, filename]) =>
            !supportedLocales.includes(locale) ||
            locale === source['locale'] ||
            typeof filename !== 'string' ||
            !isSafeRelativePath(filename),
        )
      ) {
        issues.push(
          `${prefix}.translations must map non-source locales to safe paths`,
        );
      }
    }
  }

  return issues;
}
