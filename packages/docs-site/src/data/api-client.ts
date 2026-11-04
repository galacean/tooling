import { getAPISymbolRouteSegment, parseAPIManifest } from './api-manifest';
import type {
  APIManifest,
  APIManifestPackage,
  APIVersion,
} from './api-manifest';
import { loadJSON } from './load-resource';
import { apiSymbolPath, isSupportedLocale } from '../i18n';
import { parseAPISnapshot } from './api-snapshot';
import type { ParsedAPISnapshot } from './api-snapshot';

export interface APIDocumentationClient<TLocale extends string, TData> {
  loadManifest: () => Promise<APIManifest>;
  loadAPI: (
    packageKey: string,
    version: string,
    locale: TLocale,
  ) => Promise<TData>;
}

interface APIDocumentationClientOptions<TLocale extends string, TData> {
  baseURL: string;
  locales: readonly TLocale[];
  parseSnapshot: (
    raw: unknown,
    locale: TLocale,
    info: APIVersion,
    current: boolean,
    packages: APIManifestPackage[],
  ) => TData;
  fetcher?: typeof fetch;
}

export type TypeDocAPIDocumentationData = ParsedAPISnapshot<object, object>;

export interface TypeDocAPIDocumentationClientOptions<TLocale extends string> {
  baseURL: string;
  locales: readonly TLocale[];
  fetcher?: typeof fetch;
}

export function createAPIDocumentationClient<TLocale extends string, TData>({
  baseURL,
  locales,
  parseSnapshot,
  fetcher: providedFetcher,
}: APIDocumentationClientOptions<TLocale, TData>): APIDocumentationClient<
  TLocale,
  TData
> {
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  const fetcher: typeof fetch =
    providedFetcher ?? ((...args) => globalThis.fetch(...args));
  let cachedManifest: Promise<APIManifest> | undefined;
  const cachedSnapshots = new Map<string, Promise<TData>>();

  function loadManifest(): Promise<APIManifest> {
    if (cachedManifest === undefined) {
      cachedManifest = loadJSON(`${base}data/api/manifest.json`, fetcher)
        .then(parseAPIManifest)
        .catch((error: unknown) => {
          cachedManifest = undefined;

          throw error;
        });
    }

    return cachedManifest;
  }

  async function loadAPI(
    packageKey: string,
    version: string,
    locale: TLocale,
  ): Promise<TData> {
    if (!locales.includes(locale)) {
      throw new Error(`Unsupported API locale: ${locale}`);
    }
    const manifest = await loadManifest();
    const pkg = manifest.packages.find(item => item.key === packageKey);
    const info =
      version === 'current'
        ? pkg?.current
        : pkg?.versions.find(item => item.version === version);
    const path = info?.json[locale];

    if (info === undefined || path === undefined) {
      throw new Error(
        `Unknown API version: ${packageKey}/${version}/${locale}`,
      );
    }

    const cacheKey = `${info.snapshot}/${locale}/${version === 'current' ? 'preview' : 'release'}`;
    const pending =
      cachedSnapshots.get(cacheKey) ??
      loadJSON(`${base}data/${path}`, fetcher).then(raw =>
        parseSnapshot(
          raw,
          locale,
          info,
          version === 'current',
          manifest.packages,
        ),
      );

    cachedSnapshots.set(cacheKey, pending);

    try {
      return await pending;
    } catch (error) {
      cachedSnapshots.delete(cacheKey);

      throw error;
    }
  }

  return { loadManifest, loadAPI };
}

export function createTypeDocAPIDocumentationClient<TLocale extends string>({
  baseURL,
  locales,
  fetcher,
}: TypeDocAPIDocumentationClientOptions<TLocale>): APIDocumentationClient<
  TLocale,
  TypeDocAPIDocumentationData
> {
  return createAPIDocumentationClient({
    baseURL,
    locales,
    ...(fetcher === undefined ? {} : { fetcher }),
    parseSnapshot: (raw, locale, info, current, available) =>
      parseAPISnapshot<TLocale, object, object>(
        raw,
        locale,
        info,
        current,
        available,
        value => isSupportedLocale(value, locales),
        (pageLocale, packageKey, version, symbol, entryKey, hash) => {
          const packageInfo = available.find(item => item.key === packageKey);
          const versionInfo = packageInfo?.versions.find(
            item => item.version === version,
          );
          const symbols =
            versionInfo?.entries.find(entry => entry.key === entryKey)
              ?.symbols ?? [];

          return apiSymbolPath(
            pageLocale,
            packageKey,
            version,
            getAPISymbolRouteSegment(symbols, symbol),
            entryKey,
            hash,
          );
        },
      ),
  });
}
