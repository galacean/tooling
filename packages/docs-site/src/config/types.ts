import type { ReactNode } from 'react';
import type { CommonSiteMessages } from '../i18n/messages';
import type { DocsSiteStorageKeyOverrides, DocsSiteStorageKeys } from '../preferences/storage';
import type { IconName } from '../components/shared/icon';

export type DocsSiteMessages = CommonSiteMessages & { manualIntro: string };

export interface DocsDataBaseURLs {
  production?: string;
  development?: string;
}

export interface DocsSiteAPIOptions<TLocale extends string = string> {
  sourceLinkTemplate: string;
  rawAssetURLTemplate: string;
  symbolCountLabelTemplates: Readonly<Record<TLocale, string>>;
  packageReadmes: Readonly<Record<string, Partial<Record<TLocale, string>>>>;
}

export type DocsSitePageDeclaration<TLocale extends string = string, TIcon extends string = IconName> =
  ({ slug: null } | { slug: string; title: Readonly<Record<TLocale, string>> }) & {
    icon?: TIcon;
    seo?: { description?: Readonly<Partial<Record<TLocale, string>>> };
  };

export type DocsSitePage<TLocale extends string> = DocsSitePageDeclaration<TLocale> & {
  render: (locale: TLocale) => ReactNode;
};

export interface DocsSiteOptions<TLocale extends string> {
  /** URL path where the router is mounted, for example /docs/. */
  baseURL: string;
  /** Published prefix before data/, independent of the router base. */
  dataBaseURL?: string;
  locales: readonly TLocale[];
  defaultLocale: TLocale;
  brandLabel: string;
  brandMarkURLs: Readonly<{ light: string; dark: string }>;
  docsBrandMarkURLs?: Readonly<{ light: string; dark: string }>;
  githubHref?: string;
  /** Homepage destination; paths are relative to baseURL. Defaults to /. */
  homeHref?: string;
  storageKeys?: DocsSiteStorageKeyOverrides;
  localeLabels: Readonly<Record<TLocale, string>>;
  messages: (locale: TLocale) => DocsSiteMessages;
  /** Explicitly enable manuals, optionally overriding their published directory. */
  manual: boolean | { dataURL?: string };
  api?: DocsSiteAPIOptions<TLocale>;
  siteOrigin?: string;
  getSearchDataURL?: (locale: TLocale) => string;
}

export type ResolvedDocsSiteOptions<TLocale extends string> = Omit<
  DocsSiteOptions<TLocale>,
  'dataBaseURL' | 'docsBrandMarkURLs' | 'homeHref' | 'storageKeys' |
  'manual' | 'siteOrigin' | 'getSearchDataURL'
> & {
  dataBaseURL: string;
  docsBrandMarkURLs: Readonly<{ light: string; dark: string }>;
  homeHref: string;
  storageKeys: DocsSiteStorageKeys;
  manual: false | { dataURL: string };
  siteOrigin: string;
  getSearchDataURL: (locale: TLocale) => string;
};
