import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { getAPISymbolRouteSegment } from '../../data';
import type { APIManifest, APIVersion } from '../../data';
import type { SiteShellOutletContext } from '../site/site-shell';
import { APINavigationToolbar, APISymbolMenu } from './api-navigation';
import type { APINavigationToolbarProps } from './api-navigation';
import { APIReferenceLayout } from './api-reference-layout';
import type { APIReferenceLayoutProps } from './api-reference-layout';
import { DocumentError, DocumentLoading } from '../shared';

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
  locale: string;
  messages: APIReferencePageMessages;
  loadManifest: () => Promise<APIManifest>;
  loadAPI: (
    packageKey: string,
    version: string,
    locale: string,
  ) => Promise<TData>;
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
  symbolCountLabel: (count: number, locale: string) => string;
  renderPackageReadme: (
    packageKey: string,
    packageKeys: string[],
    locale: string,
  ) => ReactNode;
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
>({
  locale,
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
  const {
    pkg: packageKey,
    version = 'current',
    symbol: symbolSegment,
  } = useParams();
  const location = useLocation();
  const shellContext = useOutletContext<SiteShellOutletContext | null>();
  const setAPIDocumentTitle = shellContext?.setAPIDocumentTitle;
  const [query] = useSearchParams();
  const [apiManifest, setAPIManifest] = useState<APIManifest>();
  const [data, setData] = useState<TData>();
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [showInherited, setShowInherited] = useState(false);
  const [hashError, setHashError] = useState(false);

  useEffect(() => {
    shellContext?.setAPISidebarCollapsed(collapsed);
  }, [collapsed, shellContext]);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const pkg = apiManifest?.packages.find(item => item.key === packageKey);
  const requestedPackageKey = query.get('package');
  const entryKey = query.get('entry') ?? 'root';
  const versionInfo =
    version === 'current'
      ? pkg?.current
      : pkg?.versions.find(item => item.version === version);
  const packageHome = packageKey !== undefined && symbolSegment === undefined;
  const displayedVersion = packageHome ? pkg?.current : versionInfo;
  const entry = packageHome
    ? displayedVersion?.entries[0]
    : displayedVersion?.entries.find(item => item.key === entryKey);
  const activeEntryKey = packageHome ? (entry?.key ?? 'root') : entryKey;
  const symbolName =
    symbolSegment === undefined
      ? undefined
      : entry?.symbols.find(
          item =>
            getAPISymbolRouteSegment(entry.symbols, item.name) ===
            symbolSegment,
        )?.name;
  const symbol =
    symbolName === undefined
      ? undefined
      : entry?.symbols.find(item => item.name === symbolName);
  const reflection =
    symbol === undefined ? undefined : data?.index.byId.get(symbol.id);
  const valid =
    apiManifest === undefined ||
    packageKey === undefined ||
    (pkg !== undefined &&
      displayedVersion !== undefined &&
      entry !== undefined &&
      (packageHome || (symbol !== undefined && versionInfo !== undefined)));
  const apiDocumentTitle =
    pkg === undefined
      ? (symbolSegment ?? packageKey ?? t.api)
      : packageHome
        ? pkg.name
        : (symbolName ?? t.notFound);

  useEffect(() => {
    setAPIDocumentTitle?.(apiDocumentTitle);
  }, [apiDocumentTitle, setAPIDocumentTitle]);

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
    if (!valid || packageKey === undefined || packageHome) {
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
      const target = document.getElementById(anchor);

      if (target === null) {
        setHashError(true);
      } else {
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });

    return () => window.clearTimeout(timer);
  }, [
    packageHome,
    data,
    reflection,
    location.pathname,
    location.hash,
    locale,
    showInherited,
  ]);

  if (error !== '') {
    return (
      <DocumentError
        title={t.loadError}
        description={t.loadErrorDescription}
        layout="page"
      />
    );
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
    const firstPackage =
      apiManifest.packages.find(item => item.key === requestedPackageKey) ??
      apiManifest.packages[0];

    if (firstPackage === undefined) {
      return (
        <NotFoundPage
          title={t.notFound}
          href={getAPIHref(locale)}
          linkLabel={t.api}
        />
      );
    }

    return <Navigate replace to={getPackageHref(locale, firstPackage.key)} />;
  }
  if (
    pkg === undefined ||
    entry === undefined ||
    displayedVersion === undefined
  ) {
    return (
      <NotFoundPage
        title={t.notFound}
        href={getAPIHref(locale)}
        linkLabel={t.api}
      />
    );
  }
  if (
    !packageHome &&
    (data === undefined ||
      reflection === undefined ||
      versionInfo === undefined)
  ) {
    return <DocumentLoading layout="api" label={t.loading} />;
  }

  const renderMenu = (close: () => void) => (
    <APISymbolMenu
      symbols={entry.symbols}
      selectedName={symbolName}
      ariaLabel={t.api}
      getGroupLabel={getGroupLabel}
      getSymbolHref={name =>
        getSymbolHref(
          locale,
          pkg.key,
          version,
          getAPISymbolRouteSegment(entry.symbols, name),
          activeEntryKey,
        )
      }
      renderKind={kind => renderKind(kind, true)}
      onSelect={close}
    />
  );

  return (
    <APIReferenceLayout
      messages={{
        ...t,
        collapseSidebar:
          t.collapseSidebar ??
          (locale.startsWith('zh') ? '收起侧栏' : 'Collapse sidebar'),
        expandSidebar:
          t.expandSidebar ??
          (locale.startsWith('zh') ? '展开侧栏' : 'Expand sidebar'),
      }}
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
          entryKey={entryKey}
          symbol={
            reflection === undefined
              ? undefined
              : { name: symbol?.name ?? '', kind: symbol?.kind ?? 0 }
          }
          packageHome={packageHome}
          showInherited={showInherited}
          onShowInheritedChange={setShowInherited}
          messages={t}
          getPackageHref={key => getPackageHref(locale, key)}
          getSymbolHref={target => {
            const targetVersion =
              target.version === 'current'
                ? pkg.current
                : pkg.versions.find(item => item.version === target.version);
            const targetSymbols =
              targetVersion?.entries.find(
                entry => entry.key === target.entryKey,
              )?.symbols ?? [];

            return getSymbolHref(
              locale,
              pkg.key,
              target.version,
              getAPISymbolRouteSegment(targetSymbols, target.symbolName),
              target.entryKey,
            );
          }}
          renderKind={kind => renderKind(kind, true)}
        />
      }
    >
      {packageHome ? (
        renderPackageReadme(
          pkg.key,
          apiManifest.packages.map(item => item.key),
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
            versionInfo !== undefined &&
            renderReflection(
              reflection,
              data,
              version,
              versionInfo,
              showInherited,
            )}
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
    <main className="state-page">
      <h1>{title}</h1>
      {path !== undefined && <p>{path}</p>}
      <Link to={href}>{linkLabel}</Link>
    </main>
  );
}
