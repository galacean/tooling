import { DocumentBoundary } from '../../providers/root';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DocsLink as Link,
  DocsNavigationProvider,
  useDocsLocation as useLocation,
} from '../../routing/navigation';
import type { DocsNavigation } from '../../routing/navigation';
import { findAPIVersion } from '../../data/api-selection';
import type { APISelection } from '../../data/api-selection';
import type { APIManifest, APIVersion } from '../../data';
import { APINavigationToolbar, APISymbolMenu } from './api-navigation';
import type { APINavigationToolbarProps } from './api-navigation';
import { APIReferenceLayout } from './api-reference-layout';
import type { APIReferenceLayoutProps } from './api-reference-layout';
import { DocumentError, DocumentLoading } from '../shared';
import { findDocumentAnchor } from '../shared/document-anchor';

export type APIReferencePageMessages = APINavigationToolbarProps['messages'] &
  APIReferenceLayoutProps['messages'] & {
    loading: string;
    loadError: string;
    loadErrorDescription: string;
    notFound: string;
    unknownHash: string;
  };

export interface APIReferencePageProps<
  TReflection extends object,
  TData extends {
    index: { byId: Map<number, TReflection> };
  },
> {
  navigation?: DocsNavigation | undefined;
  locale: string;
  selection?: APISelection | undefined;
  onPackageChange?: ((packageKey: string) => void) | undefined;
  onVersionChange?: ((version: string) => void) | undefined;
  onTitleChange?: ((title: string) => void) | undefined;
  onContentLocalesChange?: ((locales: string[] | undefined) => void) | undefined;
  onSidebarCollapsed?: ((collapsed: boolean) => void) | undefined;
  messages: APIReferencePageMessages;
  loadManifest: () => Promise<APIManifest>;
  loadAPI: (packageKey: string, version: string, locale: string) => Promise<TData>;
  getAPIHref: (locale: string) => string;
  getPackageHref: (locale: string, packageKey: string) => string;
  getSymbolHref: (
    locale: string,
    packageKey: string,
    version: string,
    symbol: string,
    entryKey: string,
  ) => string;
  getGroupLabel: (kind: number) => string;
  renderKind: (kind: number, compact: boolean) => ReactNode;
  renderPackageReadme: (packageKey: string, locale: string) => ReactNode;
  renderReflection: (
    reflection: TReflection,
    data: TData,
    version: string,
    versionInfo: APIVersion,
    showInherited: boolean,
  ) => ReactNode;
}

export function APIReferencePage<
  TReflection extends object,
  TData extends {
    index: { byId: Map<number, TReflection> };
  },
>(props: APIReferencePageProps<TReflection, TData>) {
  return (
    <DocsNavigationProvider navigation={props.navigation}>
      <DocumentBoundary locale={props.locale}>
        <APIReferencePageContent {...props} />
      </DocumentBoundary>
    </DocsNavigationProvider>
  );
}

function APIReferencePageContent<
  TReflection extends object,
  TData extends {
    index: { byId: Map<number, TReflection> };
  },
>({
  locale,
  selection,
  onPackageChange,
  onVersionChange,
  onTitleChange: setAPIDocumentTitle,
  onContentLocalesChange: setContentLocales,
  onSidebarCollapsed,
  messages: t,
  loadManifest,
  loadAPI,
  getAPIHref,
  getPackageHref,
  getSymbolHref,
  getGroupLabel,
  renderKind,
  renderPackageReadme,
  renderReflection,
}: APIReferencePageProps<TReflection, TData>) {
  const location = useLocation();
  const { packageKey, version, entryKey, symbol: symbolName } = selection ?? {};
  const [apiManifest, setAPIManifest] = useState<APIManifest>();
  const [data, setData] = useState<TData>();
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [showInherited, setShowInherited] = useState(false);
  const [hashError, setHashError] = useState(false);

  useEffect(() => {
    onSidebarCollapsed?.(collapsed);
  }, [collapsed, onSidebarCollapsed]);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const pkg = apiManifest?.packages.find(item => item.key === packageKey);

  const versionInfo = findAPIVersion(pkg, version);
  const packageHome = packageKey !== undefined && symbolName === undefined;
  const entry = versionInfo?.entries.find(item => item.key === entryKey);

  const symbol =
    symbolName === undefined ? undefined : entry?.symbols.find(item => item.name === symbolName);
  const reflection = symbol === undefined ? undefined : data?.index.byId.get(symbol.id);
  const valid =
    apiManifest === undefined ||
    packageKey === undefined ||
    (entry !== undefined && (packageHome || symbol !== undefined));
  const apiDocumentTitle =
    pkg === undefined
      ? (symbolName ?? packageKey ?? t.api)
      : packageHome
        ? pkg.name
        : (symbolName ?? t.notFound);

  useEffect(() => {
    setAPIDocumentTitle?.(apiDocumentTitle);
  }, [apiDocumentTitle, setAPIDocumentTitle]);

  useEffect(() => {
    if (versionInfo !== undefined) {
      setContentLocales?.(packageHome ? undefined : versionInfo.translatedLocales);
    }
  }, [versionInfo, packageHome, setContentLocales]);

  useEffect(() => {
    let cancelled = false;

    void loadManifest()
      .then(value => {
        if (!cancelled) {
          setAPIManifest(value);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadManifest]);

  useEffect(() => {
    let cancelled = false;

    if (apiManifest === undefined) {
      return;
    }
    setError('');
    setData(undefined);
    if (!valid || packageKey === undefined || version === undefined || packageHome) {
      return;
    }
    void loadAPI(packageKey, version, locale)
      .then(value => {
        if (!cancelled) {
          setData(value);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiManifest, loadAPI, packageKey, version, locale, valid, packageHome]);

  useEffect(() => {
    if (packageHome || data === undefined || reflection === undefined) {
      return;
    }
    setHashError(false);
    const timer = window.setTimeout(() => {
      if (location.hash === '') {
        scrollContainer.current?.scrollTo({ top: 0 });

        return;
      }
      let anchor: string;

      try {
        anchor = decodeURIComponent(location.hash.slice(1));
      } catch {
        setHashError(true);

        return;
      }
      const target = findDocumentAnchor(scrollContainer.current, anchor);

      if (target === null) {
        setHashError(true);
      } else {
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });

    return () => window.clearTimeout(timer);
  }, [packageHome, data, reflection, location.pathname, location.hash, locale, showInherited]);

  if (error !== '') {
    return <DocumentError title={t.loadError} description={t.loadErrorDescription} layout="page" />;
  }
  if (apiManifest === undefined) {
    return <DocumentLoading layout="api" label={t.loading} />;
  }
  if (!valid) {
    return (
      <NotFoundPage
        title={t.notFound}
        path={location.pathname}
        href={getAPIHref(locale)}
        linkLabel={t.api}
      />
    );
  }
  if (packageKey === undefined) {
    return (
      <main className="docs-state-page">
        <h1>{t.api}</h1>
        <ul>
          {apiManifest.packages.map(item => (
            <li key={item.key}>
              <Link to={getPackageHref(locale, item.key)}>{item.name}</Link>
            </li>
          ))}
        </ul>
      </main>
    );
  }
  if (
    pkg === undefined ||
    entry === undefined ||
    versionInfo === undefined ||
    version === undefined ||
    entryKey === undefined
  ) {
    return <NotFoundPage title={t.notFound} href={getAPIHref(locale)} linkLabel={t.api} />;
  }
  if (
    !packageHome &&
    (data === undefined || reflection === undefined)
  ) {
    return <DocumentLoading layout="api" label={t.loading} />;
  }

  const renderMenu = (close: () => void) => (
    <APISymbolMenu
      symbols={entry.symbols}
      selectedName={symbolName}
      ariaLabel={t.api}
      getGroupLabel={getGroupLabel}
      getSymbolHref={name => getSymbolHref(locale, pkg.key, version, name, entryKey)}
      renderKind={kind => renderKind(kind, true)}
      onSelect={close}
    />
  );

  return (
    <APIReferenceLayout
      messages={t}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed(value => !value)}
      drawerOpen={drawer}
      onDrawerChange={setDrawer}
      navigationKey={`${location.pathname}${location.search}`}
      scrollRef={scrollContainer}
      renderNavigation={renderMenu}
      toolbar={
        <APINavigationToolbar
          pkg={pkg}
          packages={apiManifest.packages}
          version={version}
          symbol={
            reflection === undefined
              ? undefined
              : { name: symbol?.name ?? '', kind: symbol?.kind ?? 0 }
          }
          packageHome={packageHome}
          showInherited={showInherited}
          onShowInheritedChange={setShowInherited}
          messages={t}
          onPackageChange={onPackageChange}
          onVersionChange={onVersionChange}
          renderKind={kind => renderKind(kind, true)}
        />
      }
    >
      {packageHome ? (
        renderPackageReadme(
          pkg.key,
          locale,
        )
      ) : (
        <>
          {hashError && (
            <div className="api-notice" role="status">
              {t.unknownHash}: {location.hash}
            </div>
          )}
          {data !== undefined &&
            reflection !== undefined &&
            renderReflection(reflection, data, version, versionInfo, showInherited)}
        </>
      )}
    </APIReferenceLayout>
  );
}

function NotFoundPage({
  title,
  path,
  href,
  linkLabel,
}: {
  title: string;
  path?: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <main className="docs-state-page">
      <h1>{title}</h1>
      {path !== undefined && <p>{path}</p>}
      <Link to={href}>{linkLabel}</Link>
    </main>
  );
}
