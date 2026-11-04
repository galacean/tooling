import type { ReactNode } from 'react';
import type { APIManifest, APIReadmeData, ReflectionIndex } from '../../data';
import { apiPackagePath, apiSymbolPath, localePath } from '../../i18n';
import type { APIReferencePageMessages } from './api-reference-page';
import { APIReferencePage } from './api-reference-page';
import type {
  APITypeDocContext,
  APITypeDocDetailMessages,
} from './api-typedoc-detail';
import { APITypeDocDetail } from './api-typedoc-detail';
import { APIKindLabel, apiKindGroup } from './api-kind-label';
import { APIPackageReadme } from './api-package-readme';
import type { CommonSiteMessages } from '../../i18n';

export type APIReferenceRouteMessages = APIReferencePageMessages &
  Omit<APITypeDocDetailMessages, 'deprecated'> &
  CommonSiteMessages;

export interface APIReferenceRouteProps<
  TLocale extends string,
  TProject extends object,
  TReflection extends object,
  TData extends { project: TProject; index: ReflectionIndex<TReflection> },
> {
  locale: TLocale;
  messages: APIReferenceRouteMessages;
  isLocale: (value: unknown) => value is TLocale;
  getLocaleLabel: (locale: string) => string;
  loadManifest: () => Promise<APIManifest>;
  loadAPI: (
    packageKey: string,
    version: string,
    locale: TLocale,
  ) => Promise<TData>;
  getAPIHref?: (locale: TLocale) => string;
  getPackageHref?: (locale: TLocale, packageKey: string) => string;
  getSymbolHref?: (
    locale: TLocale,
    packageKey: string,
    version: string,
    symbol: string,
    entryKey: string,
  ) => string;
  symbolCountLabel: (count: number, locale: TLocale) => string;
  loadReadme: (
    packageKey: string,
    locale: TLocale,
  ) => Promise<APIReadmeData<TLocale>>;
  resolveReadmeLink: (packageKey: string, href: string) => string;
  resolveReadmeImage: (packageKey: string, src: string) => string;
  getRepositoryFileURL: (revision: string, filePath?: string) => string;
}

export function APIReferenceRoute<
  TLocale extends string,
  TProject extends object,
  TReflection extends object,
  TData extends { project: TProject; index: ReflectionIndex<TReflection> },
>({
  locale,
  messages: t,
  isLocale,
  getLocaleLabel,
  loadManifest,
  loadAPI,
  getAPIHref = locale => localePath(locale, ['api']),
  getPackageHref = (locale, packageKey) => apiPackagePath(locale, packageKey),
  getSymbolHref = (locale, packageKey, version, symbol, entryKey) =>
    apiSymbolPath(locale, packageKey, version, symbol, entryKey),
  symbolCountLabel,
  loadReadme,
  resolveReadmeLink,
  resolveReadmeImage,
  getRepositoryFileURL,
}: APIReferenceRouteProps<TLocale, TProject, TReflection, TData>) {
  function parseLocale(value: string): TLocale {
    if (!isLocale(value)) {
      throw new Error(`Unknown API locale: ${value}`);
    }

    return value;
  }

  const groupLabel = (kind: number) => t[apiKindGroup(kind)];
  const renderKind = (kind: number, compact: boolean): ReactNode => (
    <APIKindLabel kind={kind} label={groupLabel(kind)} compact={compact} />
  );

  return (
    <APIReferencePage<TReflection, TData>
      locale={locale}
      messages={t}
      loadManifest={loadManifest}
      loadAPI={(packageKey, version, pageLocale) =>
        loadAPI(packageKey, version, parseLocale(pageLocale))
      }
      getAPIHref={pageLocale => getAPIHref(parseLocale(pageLocale))}
      getPackageHref={(pageLocale, packageKey) =>
        getPackageHref(parseLocale(pageLocale), packageKey)
      }
      getSymbolHref={(pageLocale, packageKey, version, symbol, entryKey) =>
        getSymbolHref(
          parseLocale(pageLocale),
          packageKey,
          version,
          symbol,
          entryKey,
        )
      }
      getGroupLabel={groupLabel}
      renderKind={renderKind}
      symbolCountLabel={(count, pageLocale) =>
        symbolCountLabel(count, parseLocale(pageLocale))
      }
      renderPackageReadme={(packageKey, _packageKeys, pageLocale) => (
        <APIPackageReadme
          packageKey={packageKey}
          locale={parseLocale(pageLocale)}
          loadReadme={(key, readmeLocale) =>
            loadReadme(key, parseLocale(readmeLocale))
          }
          loadErrorTitle={t.loadError}
          loadErrorDescription={t.loadErrorDescription}
          loadingLabel={t.loading}
          unknownHashLabel={t.unknownHash}
          copyLabel={t.copy}
          copiedLabel={t.copied}
          copyFailedLabel={t.copyFailed}
          resolveLink={url => resolveReadmeLink(packageKey, url)}
          resolveImage={url => resolveReadmeImage(packageKey, url)}
        />
      )}
      renderReflection={(
        reflection,
        data,
        version,
        versionInfo,
        showInherited,
      ) => {
        const context: APITypeDocContext<TProject, TReflection, TLocale> = {
          project: data.project,
          index: data.index,
          locale,
          version,
          commit: versionInfo.commit,
        };

        return (
          <APITypeDocDetail
            reflection={reflection}
            context={context}
            showInherited={showInherited}
            messages={{ ...t, deprecated: '@deprecated' }}
            isLocale={isLocale}
            getLocaleLabel={getLocaleLabel}
            getGroupLabel={groupLabel}
            getRepositoryFileURL={getRepositoryFileURL}
          />
        );
      }}
    />
  );
}
