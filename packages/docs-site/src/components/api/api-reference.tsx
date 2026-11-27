import type { ReactNode } from 'react';
import type { CommonSiteMessages } from '../../i18n/messages';
import { getLocaleDefinition } from '../../i18n/registry';
import type { DocsNavigation } from '../../routing/navigation';
import type { APITarget } from '../../routing/targets';
import type { APISource } from '../../data/api-source';
import { resolveAPIReadmeLink, resolveAPIReadmeImage } from '../../data/api-readme';
import { usePageEnvironment } from '../../providers/page';
import { APIReferencePage } from './api-reference-page';
import type { APISelection } from '../../data/api-selection';
import { APITypeDocDetail } from './api-typedoc-detail';
import type { APITypeDocContext } from './api-typedoc-detail';
import { APIKindLabel, apiKindGroup } from './api-kind-label';
import { APIPackageReadme } from './api-package-readme';

export interface APIProps {
  source: APISource;
  href: (target: APITarget) => string;
  selection?: APISelection | undefined;
  locale?: string;
  messages?: Partial<CommonSiteMessages>;
  localeLabels?: Readonly<Record<string, string>>;
  navigation?: DocsNavigation;
  onPackageChange?: (key: string) => void;
  onVersionChange?: (version: string) => void;
}

export function API({
  source,
  href,
  selection,
  locale: language,
  messages,
  navigation,
  localeLabels,
  onPackageChange,
  onVersionChange,
}: APIProps) {
  const { locale, messages: t, shell } = usePageEnvironment(language, messages);
  const { repository } = source;
  const template = repository?.sourceLinkTemplate;
  const rawTemplate = repository?.rawAssetURLTemplate;
  const getRepositoryFileURL = template !== undefined
    ? (revision: string, path = '') =>
        template
          .replace(/#L\{line\}$/u, '')
          .replaceAll('{commit}', revision)
          .replaceAll('{path}', path)
    : undefined;
  const groupLabel = (kind: number) => t[apiKindGroup(kind)];
  const renderKind = (kind: number, compact: boolean): ReactNode => (
    <APIKindLabel kind={kind} label={groupLabel(kind)} compact={compact} />
  );

  return (
    <APIReferencePage
      locale={locale}
      selection={selection}
      navigation={navigation}
      onPackageChange={onPackageChange}
      onVersionChange={onVersionChange}
      onTitleChange={shell?.setTitle}
      onContentLocalesChange={shell?.setContentLocales}
      onSidebarCollapsed={shell?.setSidebarCollapsed}
      messages={t}
      loadManifest={source.loadManifest}
      loadAPI={source.loadAPI}
      getAPIHref={locale => href({ kind: 'api', locale })}
      getPackageHref={(locale, packageKey) => href({ kind: 'package', locale, packageKey })}
      getSymbolHref={(locale, packageKey, version, symbol, entryKey) =>
        href({ kind: 'symbol', locale, packageKey, version, symbol, entryKey })
      }
      getGroupLabel={groupLabel}
      renderKind={renderKind}
      renderPackageReadme={(packageKey, pageLocale) => (
        <APIPackageReadme
          messages={t}
          packageKey={packageKey}
          locale={pageLocale}
          loadReadme={source.loadReadme}
          resolveLink={url =>
            resolveAPIReadmeLink(packageKey, url, {
              locales: source.locales,
              packageReadmes: repository?.packageReadmes ?? {},
              getPackageHref: (locale, key) => href({ kind: 'package', locale, packageKey: key }),
              getRepositoryURL: (path, search, hash) =>
                getRepositoryFileURL ? getRepositoryFileURL('main', path + search + hash) : url,
            })
          }
          resolveImage={url =>
            rawTemplate !== undefined
              ? resolveAPIReadmeImage(packageKey, url, (path, search) =>
                  rawTemplate.replace('{path}', path)
                    .replace('{search}', search),
                )
              : url
          }
        />
      )}
      renderReflection={(reflection, data, version, versionInfo, showInherited) => {
        const context: APITypeDocContext<object, object, string> = {
          project: data.project,
          index: data.index,
          reflectionHref: (id, anchor) => {
            const target = data.index.target(locale, version, id);

            return target && href(anchor !== undefined ? { ...target, anchor } : target);
          },
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
            isLocale={source.isLocale}
            getLocaleLabel={value => localeLabels?.[value] ?? getLocaleDefinition(value).label}
            getGroupLabel={groupLabel}
            getRepositoryFileURL={getRepositoryFileURL}
          />
        );
      }}
    />
  );
}
