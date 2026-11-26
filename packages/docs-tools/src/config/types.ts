import type { DocsDataBaseURLs, DocsSitePageDeclaration } from '@galacean/docs-site';
import type { APIVersionManifest } from '../api/versions';

export type SitePageConfig = DocsSitePageDeclaration<string, string>;

/** Serializable project declaration; filesystem paths are relative to the repository or package. */
export interface DocsProjectConfigInput {
  sourceLocale: string;
  defaultLocale?: string;
  locales: string[];
  siteName?: string;
  /** Homepage destination; paths are relative to the static site base. Defaults to /. */
  homeHref?: string;
  pages?: SitePageConfig[];
  api?: {
    dataDirectory: string;
    repository?: string;
    versions?: string[];
    generation?: { scope?: 'latest' };
    packages?: APIPackageConfig[];
    typedocOptions?: Record<string, unknown>;
    sourceLinkTemplate?: string;
  };
  manual?: { dataDirectory: string; collections?: ManualCollectionConfig[] };
  translationDirectory?: string;
  dataBaseUrls?: DocsDataBaseURLs;
}

export interface APIReadmeConfig {
  sourceLocale?: string;
  files: Record<string, string>;
}

export interface APIPackageConfig {
  key: string;
  name: string;
  directory: string;
  tsconfig: string;
  entries: APIEntryConfig[];
  readme?: APIReadmeConfig;
}

export interface ManualCollectionConfig {
  key: string;
  routePrefix?: string;
  source:
    | { type: 'local'; directory: string; locale: string }
    | {
        type: 'yuque';
        mode: 'repo';
        baseURL: string;
        namespace: string;
        tokenEnv: string;
        locale: string;
      }
    | {
        type: 'yuque';
        mode: 'documents';
        baseURL: string;
        tokenEnv: string;
        locale: string;
        documents: ManualDocumentConfig[];
      };
  ignore?: {
    docIds?: string[];
    slugs?: string[];
    documentRefs?: { namespace: string; slug: string }[];
    titleContains?: string[];
  };
}

export interface ResolvedDocsBuildConfig {
  repositoryRoot: string;
  configPath: string;
  sourceLocale: string;
  defaultLocale?: string;
  locales: string[];
  apiDirectory: string;
  apiVersions?: APIVersionManifest;
  apiConfigured?: boolean;
  manualDirectory: string;
  manualConfigured?: boolean;
  translationDirectory?: string;
  apiTranslationDirectory?: string;
  translationCacheDirectory?: string;
  dataBaseURLs?: DocsDataBaseURLs;
  siteName?: string;
  homeHref?: string;
  pages?: SitePageConfig[];
  apiPackages?: APIPackageConfig[];
  manuals?: ManualCollectionConfig[];
  typedocOptions?: Record<string, unknown>;
  sourceLinkTemplate?: string;
}

export interface APIEntryConfig {
  key: string;
  source: string;
  types: string;
}

export interface ManualDocumentConfig {
  namespace: string;
  slug: string;
  routeSlug: string;
  group?: string;
  docId?: string;
}
