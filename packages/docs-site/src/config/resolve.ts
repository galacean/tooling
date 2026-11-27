import { getLocaleDefinition, normalizeLocale } from '../i18n/registry';
import { normalizeBase } from '../i18n/routes';
import type { DocsSiteStorageKeyOverrides, DocsSiteStorageKeys } from '../preferences/storage';
import type { DocsSiteOptions, ResolvedDocsSiteOptions } from './types';
import { createDocsRoutes } from '../routing/paths';
import { withTrailingSlash } from './urls';

export function resolveDocsSiteStorageKeys(
  overrides: DocsSiteStorageKeyOverrides = {},
): DocsSiteStorageKeys {
  return { locale: 'locale', theme: 'theme', searchHistory: 'search-history', ...overrides };
}

export function resolveDocsSiteOptions<TLocale extends string>(
  options: DocsSiteOptions<TLocale>,
  browserOrigin: string,
): ResolvedDocsSiteOptions<TLocale> {
  const baseURL = normalizeBase(options.baseURL);
  const dataBaseURL = withTrailingSlash(options.dataBaseURL ?? baseURL);

  for (const locale of options.locales) {
    if (normalizeLocale(locale) !== locale) {
      throw new Error(`Use canonical locale: ${locale}`);
    }
  }
  if (new Set(options.locales).size !== options.locales.length || !options.locales.includes(options.defaultLocale)) {
    throw new Error('Invalid configured locales or default locale');
  }

  const { routePaths, ...site } = options;
  const routes = createDocsRoutes(routePaths);
  const sectionRoots = [routes.patterns.home,
    ...(options.manual === false ? [] : [routes.patterns.manual]),
    ...(options.api === undefined ? [] : [routes.patterns.api])];

  if (new Set(sectionRoots).size !== sectionRoots.length) {
    throw new Error('Enabled documentation section routes must be distinct');
  }

  return {
    ...site,
    routes,
    localeLabels: Object.fromEntries(options.locales.map(locale => [locale, options.localeLabels?.[locale] ?? getLocaleDefinition(locale, options.i18n?.localeDefinitions).label])) as Record<TLocale, string>,
    baseURL,
    dataBaseURL,
    docsBrandMarkURLs: options.docsBrandMarkURLs ?? options.brandMarkURLs,
    storageKeys: resolveDocsSiteStorageKeys(options.storageKeys),
    manual: options.manual === false ? false : {
      dataURL: withTrailingSlash(
        (options.manual === true ? undefined : options.manual.dataURL) ?? `${dataBaseURL}data/manual/`,
      ),
    },
    siteOrigin: options.siteOrigin ?? browserOrigin,
    getSearchDataURL: options.getSearchDataURL ?? (locale => `${dataBaseURL}data/search/${locale}.json`),
  };
}
