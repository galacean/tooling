import { isSafePathSegment } from '../path-validation';
import { validateAPIConfig } from './api-config-validation';
import { validateManualCollections } from './manual-config-validation';
import { isRecord } from './validation';
import type { DocsProjectConfigInput } from './types';

function isLocaleTag(value: string): boolean {
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(value);
}

function validateSitePages(value: unknown, locales: string[]): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return ['pages must be an array'];
  }
  const issues: string[] = [];
  const slugs = new Set<string | null>(['api', 'manual']);

  for (const [index, page] of value.entries()) {
    if (!isRecord(page)) {
      issues.push(`pages[${index}] must be an object`);
      continue;
    }
    const slug = page['slug'];
    const title = page['title'];

    if (slug !== null && (typeof slug !== 'string' || !isSafePathSegment(slug))) {
      issues.push(`pages[${index}].slug must be null or a safe path segment`);
      continue;
    }
    if (slugs.has(slug)) {
      issues.push(`pages[${index}].slug conflicts with another site route: ${String(slug)}`);
    }
    slugs.add(slug);
    if (page['icon'] !== undefined && typeof page['icon'] !== 'string') {
      issues.push(`pages[${index}].icon must be a string`);
    }
    if (slug !== null) {
      for (const locale of locales) {
        const label = isRecord(title) ? title[locale] : undefined;

        if (typeof label !== 'string' || label.trim() === '') {
          issues.push(`pages[${index}].title.${locale} must be a non-empty string`);
        }
      }
    }
  }

  return issues;
}

export function validateDocsProjectConfig(config: unknown, configPath: string): DocsProjectConfigInput {
  const issues: string[] = [];

  if (!isRecord(config)) {
    issues.push('expected an object export');
  } else {
    const api = config['api'];
    const manual = config['manual'];
    const locales = config['locales'];
    const sourceLocale = config['sourceLocale'];

    if (config['packageReadmes'] !== undefined) {
      issues.push(
        'packageReadmes must be configured under api.packages[].readme.files',
      );
    }
    if (config['packageReadmeSourceLocales'] !== undefined) {
      issues.push(
        'packageReadmeSourceLocales must be configured as api.packages[].readme.sourceLocale',
      );
    }
    if (config['manuals'] !== undefined) {
      issues.push(
        'manual collections must be configured under manual.collections',
      );
    }
    issues.push(...validateAPIConfig(api, locales, sourceLocale));
    if (isRecord(api) && api['generation'] !== undefined) {
      if (
        !isRecord(api['generation']) ||
        api['generation']['scope'] !== 'latest'
      ) {
        issues.push('api.generation.scope must be latest');
      }
    }

    if (
      manual !== undefined &&
      (!isRecord(manual) || typeof manual['dataDirectory'] !== 'string')
    ) {
      issues.push('manual.dataDirectory must be a string');
    }
    if (typeof sourceLocale !== 'string' || !isLocaleTag(sourceLocale)) {
      issues.push('sourceLocale must be a valid locale tag');
    }
    if (!Array.isArray(locales) || locales.some(locale => typeof locale !== 'string')) {
      issues.push('locales must be an array of valid locale tags');
    } else {
      if (locales.length === 0 || locales.some(locale => typeof locale !== 'string' || !isLocaleTag(locale))) {
        issues.push('locales must be a non-empty array of valid locale tags');
      }
      if (new Set(locales).size !== locales.length) {
        issues.push('locales must not contain duplicates');
      }
      if (typeof sourceLocale === 'string' && !locales.includes(sourceLocale)) {
        issues.push('locales must include sourceLocale');
      }
    }
    if (config['translationWorkDirectory'] !== undefined) {
      issues.push('translationWorkDirectory is no longer supported; use translationDirectory');
    }
    if (
      config['translationDirectory'] !== undefined &&
      typeof config['translationDirectory'] !== 'string'
    ) {
      issues.push('translationDirectory must be a string');
    }
    const dataBaseURLs = config['dataBaseUrls'];

    if (dataBaseURLs !== undefined &&
      (!isRecord(dataBaseURLs) || Object.values(dataBaseURLs).some(value => typeof value !== 'string'))) {
      issues.push('dataBaseUrls must map environments to URL strings');
    }
    if (
      config['siteName'] !== undefined &&
      (typeof config['siteName'] !== 'string' ||
        config['siteName'].trim() === '')
    ) {
      issues.push('siteName must be a non-empty string');
    }
    if (
      config['homeHref'] !== undefined &&
      (typeof config['homeHref'] !== 'string' || config['homeHref'].trim() === '')
    ) {
      issues.push('homeHref must be a non-empty string');
    }
    const manualCollections = isRecord(manual)
      ? manual['collections']
      : undefined;

    issues.push(...validateManualCollections(manualCollections, locales));
    issues.push(...validateSitePages(
      config['pages'],
      Array.isArray(locales) ? locales.filter((locale): locale is string => typeof locale === 'string') : [],
    ));
  }
  if (issues.length > 0) {
    const exportKeys = isRecord(config) ? Object.keys(config).join(', ') : '';

    throw new Error(
      `Invalid docs site config: ${configPath} (${issues.join('; ')}; exports: ${exportKeys})`,
    );
  }

  return config as DocsProjectConfigInput;
}
