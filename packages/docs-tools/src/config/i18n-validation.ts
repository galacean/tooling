import { commonMessages, normalizeLocale } from '@galacean/docs-site';
import { isRecord } from './validation';

function localeMap(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const normalized: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    const locale = normalizeLocale(key);

    if (Object.hasOwn(normalized, locale)) {
      throw new Error(`Duplicate normalized locale map key: ${locale}`);
    }
    normalized[locale] = item;
  }

  return normalized;
}

export function normalizeDocsLocales(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const result = { ...value };

  for (const key of ['sourceLocale', 'defaultLocale']) {
    if (typeof result[key] === 'string') {
      result[key] = normalizeLocale(result[key]);
    }
  }
  if (Array.isArray(result['locales'])) {
    result['locales'] = result['locales'].map((locale: unknown) => typeof locale === 'string' ? normalizeLocale(locale) : locale);
  }
  if (Array.isArray(result['pages'])) {
    result['pages'] = result['pages'].map((page: unknown) => {
      if (!isRecord(page)) {
        return page;
      }

      return { ...page, ...(page['title'] === undefined ? {} : { title: localeMap(page['title']) }),
        ...(isRecord(page['seo']) ? { seo: { ...page['seo'], ...(page['seo']['description'] === undefined ? {} : { description: localeMap(page['seo']['description']) }) } } : {}) };
    });
  }
  const api = result['api'];

  if (isRecord(api) && Array.isArray(api['packages'])) {
    result['api'] = { ...api, packages: api['packages'].map((pkg: unknown) => {
      if (!isRecord(pkg) || !isRecord(pkg['readme'])) {
        return pkg;
      }
      const readme = pkg['readme'];

      return { ...pkg, readme: { ...readme, files: localeMap(readme['files']),
        ...(typeof readme['sourceLocale'] === 'string' ? { sourceLocale: normalizeLocale(readme['sourceLocale']) } : {}) } };
    }) };
  }
  const manual = result['manual'];

  if (isRecord(manual) && Array.isArray(manual['collections'])) {
    result['manual'] = { ...manual, collections: manual['collections'].map((collection: unknown) => {
      if (!isRecord(collection) || !isRecord(collection['source']) || typeof collection['source']['locale'] !== 'string') {
        return collection;
      }

      return { ...collection, source: { ...collection['source'], locale: normalizeLocale(collection['source']['locale']) } };
    }) };
  }
  const i18n = result['i18n'];

  if (isRecord(i18n)) {
    result['i18n'] = Object.fromEntries(Object.entries(i18n).map(([key, item]) => [key, localeMap(item)]));
  }

  return result;
}

export function validateI18n(value: unknown, locales: string[]): string[] {
  if (value === undefined) {
    return [];
  }
  if (!isRecord(value)) {
    return ['i18n must be an object'];
  }
  const issues: string[] = [];

  for (const [key, entries] of Object.entries(value)) {
    if (!['localeDefinitions', 'commonMessages'].includes(key) || !isRecord(entries)) {
      issues.push(`Invalid i18n field: ${key}`);
      continue;
    }
    for (const [locale, entry] of Object.entries(entries)) {
      if (!locales.includes(locale) || !isRecord(entry)) {
        issues.push(`i18n.${key}.${locale} must be a configured locale object`);
        continue;
      }
      if (key === 'localeDefinitions') {
        if (typeof entry['label'] !== 'string' || entry['label'].trim() === '' ||
          !['ltr', 'rtl'].includes(String(entry['direction'])) ||
          entry['script'] !== undefined && typeof entry['script'] !== 'string') {
          issues.push(`Invalid locale definition: ${locale}`);
        }
      } else {
        for (const [name, message] of Object.entries(entry)) {
          const template = commonMessages.en[name as keyof typeof commonMessages.en];
          const parameters = (text: string) => [...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu)].map(match => match[1]).sort().join(',');

          if (template === undefined || typeof message !== 'string' || message.trim() === '' || parameters(message) !== parameters(template)) {
            issues.push(`Invalid common message: ${locale}/${name}`);
          }
        }
      }
    }
  }

  return issues;
}
