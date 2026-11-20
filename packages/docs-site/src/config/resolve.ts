import { normalizeBase } from '../i18n/routes';
import type { DocsSiteStorageKeyOverrides, DocsSiteStorageKeys } from '../preferences/storage';
import type { DocsSiteOptions, ResolvedDocsSiteOptions } from './types';
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

  return {
    ...options,
    baseURL,
    dataBaseURL,
    docsBrandMarkURLs: options.docsBrandMarkURLs ?? options.brandMarkURLs,
    homeHref: options.homeHref ?? '/',
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
