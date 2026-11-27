import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { createAPISymbolRouteLookup } from '../../data/api-manifest';
import type { APIManifest } from '../../data/api-manifest';
import { createAPISource } from '../../data/api-source';
import { siteTargetHref } from '../../routing/paths';
import type { DocsRoutes } from '../../routing/paths';
import type { APITarget } from '../../routing/targets';
import type { DocsSiteAPIOptions, DocsSiteMessages } from '../../config/types';
import { API } from '../api/api-reference';
import { findAPIVersion, resolveAPIVersionTarget } from '../../data/api-selection';
import { DocumentError, DocumentLoading } from '../shared';

export interface SiteAPIProps {
  routes: DocsRoutes;
  dataBaseURL: string;
  locales: readonly string[];
  locale: string;
  messages: DocsSiteMessages;
  localeLabels: Readonly<Record<string, string>>;
  api: DocsSiteAPIOptions;
}

/** Routing policies for the complete site live here, outside the reusable API view. */
export function SiteAPI({
  routes,
  dataBaseURL,
  locales,
  locale,
  messages,
  localeLabels,
  api,
}: SiteAPIProps) {
  const { pkg: packageKey, version = 'current', symbol: symbolSegment } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [manifest, setManifest] = useState<APIManifest>();
  const [failed, setFailed] = useState(false);
  const [symbolRouteSegment] = useState(createAPISymbolRouteLookup);
  const source = useMemo(
    () => createAPISource({ baseURL: dataBaseURL, locales, repository: api }),
    [dataBaseURL, locales, api],
  );

  useEffect(() => {
    let cancelled = false;

    setManifest(undefined);
    setFailed(false);
    void source
      .loadManifest()
      .then(value => {
        if (!cancelled) {
          setManifest(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [source]);

  if (failed) {
    return <DocumentError title={messages.loadError} description={messages.loadErrorDescription} />;
  }
  if (manifest === undefined) {
    return <DocumentLoading layout="api" label={messages.loading} />;
  }
  if (manifest.packages.length === 0) {
    return (
      <main className="docs-state-page">
        <h1>{messages.notFound}</h1>
      </main>
    );
  }
  const query = new URL(location.search, 'https://local.invalid').searchParams;

  if (packageKey === undefined) {
    const preferred =
      manifest.packages.find(item => item.key === query.get('package')) ?? manifest.packages[0]!;

    return <Navigate replace to={routes.package(locale, preferred.key)} />;
  }
  const pkg = manifest.packages.find(item => item.key === packageKey);
  const info = findAPIVersion(pkg, version);
  const defaultEntry = symbolSegment === undefined ? info?.entries[0]?.key : 'root';
  const entryKey = query.get('entry') ?? defaultEntry ?? 'root';
  const symbols = info?.entries.find(item => item.key === entryKey)?.symbols ?? [];
  const symbol =
    symbolSegment === undefined
      ? undefined
      : (symbols.find(item => symbolRouteSegment(symbols, item.name) === symbolSegment)
          ?.name ?? symbolSegment);
  const href = (target: APITarget) => siteTargetHref(routes, target, manifest.packages, symbolRouteSegment);

  return (
    <API
      source={source}
      selection={{ packageKey, version, entryKey, symbol }}
      localeLabels={localeLabels}
      href={href}
      onPackageChange={key => {
        void navigate(routes.package(locale, key));
      }}
      onVersionChange={value => {
        if (!pkg) {
          return;
        }
        const target = resolveAPIVersionTarget(pkg, value, entryKey, symbol);

        if (target) {
          void navigate(
            href({
              kind: 'symbol',
              locale,
              packageKey: pkg.key,
              version: target.version,
              symbol: target.symbolName,
              entryKey: target.entryKey,
            }),
          );
        }
      }}
    />
  );
}
