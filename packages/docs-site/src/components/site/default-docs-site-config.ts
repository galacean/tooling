import { localePath } from '../../i18n';
import type {
  DocsSiteStorageKeyOverrides,
  DocsSiteStorageKeys,
} from '../../preferences';
import type { CommonSiteMessages } from '../../i18n';
import type { ManualPageMessages } from '../manual';

export type DocsSiteMessages = CommonSiteMessages &
  Pick<ManualPageMessages, 'manualIntro'>;

export interface DocsSiteConfiguration<TLocale extends string> {
  brandLabel: string;
  brandMarkUrls: Readonly<{ light: string; dark: string }>;
  docsBrandMarkUrls?: Readonly<{ light: string; dark: string }>;
  githubHref?: string;
  getHomeHref?: (locale: TLocale) => string;
  storageKeys?: DocsSiteStorageKeyOverrides;
  localeLabels: Readonly<Record<TLocale, string>>;
  messages: (locale: TLocale) => DocsSiteMessages;
  manualDataURL?: string;
  api?: import('../api/configured-api-page').DocsSiteAPIConfiguration;
  siteOrigin?: string;
  getSearchDataURL?: (locale: TLocale) => string;
}

export type ResolvedDocsSiteConfiguration<TLocale extends string> = Omit<
  DocsSiteConfiguration<TLocale>,
  | 'docsBrandMarkUrls'
  | 'getHomeHref'
  | 'storageKeys'
  | 'manualDataURL'
  | 'siteOrigin'
  | 'getSearchDataURL'
> & {
  docsBrandMarkUrls: Readonly<{ light: string; dark: string }>;
  getHomeHref: (locale: TLocale) => string;
  storageKeys: DocsSiteStorageKeys;
  dataBaseURL: string;
  manualDataURL: string;
  siteOrigin: string;
  getSearchDataURL: (locale: TLocale) => string;
};

export const DEFAULT_DOCS_SITE_CONFIG = {
  getDataBaseURL: (baseURL: string) => baseURL,
  getHomeHref: localePath,
  storageKeys: {
    locale: 'locale',
    theme: 'theme',
    searchHistory: 'search-history',
  },
  getSiteOrigin: () => window.location.origin,
  getManualDataURL: (dataBaseURL: string) => `${dataBaseURL}data/manual/`,
  getSearchDataURL: (dataBaseURL: string, locale: string) =>
    `${dataBaseURL}data/search/${locale}.json`,
} as const;

export function resolveDocsSiteStorageKeys(
  overrides: DocsSiteStorageKeyOverrides = {},
): DocsSiteStorageKeys {
  return { ...DEFAULT_DOCS_SITE_CONFIG.storageKeys, ...overrides };
}

export function resolveDocsSiteConfiguration<TLocale extends string>(
  site: DocsSiteConfiguration<TLocale>,
  baseURL: string,
  dataBaseURL?: string,
): ResolvedDocsSiteConfiguration<TLocale> {
  const resolvedDataBaseURL =
    dataBaseURL ?? DEFAULT_DOCS_SITE_CONFIG.getDataBaseURL(baseURL);

  return {
    ...site,
    dataBaseURL: resolvedDataBaseURL,
    docsBrandMarkUrls: site.docsBrandMarkUrls ?? site.brandMarkUrls,
    getHomeHref: site.getHomeHref ?? DEFAULT_DOCS_SITE_CONFIG.getHomeHref,
    storageKeys: resolveDocsSiteStorageKeys(site.storageKeys),
    manualDataURL:
      site.manualDataURL ??
      DEFAULT_DOCS_SITE_CONFIG.getManualDataURL(resolvedDataBaseURL),
    siteOrigin: site.siteOrigin ?? DEFAULT_DOCS_SITE_CONFIG.getSiteOrigin(),
    getSearchDataURL:
      site.getSearchDataURL ??
      (locale =>
        DEFAULT_DOCS_SITE_CONFIG.getSearchDataURL(resolvedDataBaseURL, locale)),
  };
}
