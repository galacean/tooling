import type { DocsSiteAPIOptions } from '../config/types';
import { withTrailingSlash } from '../config/urls';
import { isSupportedLocale } from '../i18n/locales';
import { findAPIVersion } from './api-selection';
import { parseAPIManifest } from './api-manifest';
import type { APIManifest } from './api-manifest';
import { loadAPIReadmeData } from './api-readme';
import { parseAPISnapshot } from './api-snapshot';
import type { ParsedAPISnapshot } from './api-snapshot';
import { loadJSON } from './load-resource';

export function createAPISource({
  baseURL,
  locales,
  repository,
  fetcher,
}: {
  baseURL: string;
  locales: readonly string[];
  repository?: Partial<DocsSiteAPIOptions>;
  fetcher?: typeof fetch;
}) {
  const base = withTrailingSlash(baseURL);
  const isLocale = (value: unknown): value is string => isSupportedLocale(value, locales);
  let cachedManifest: Promise<APIManifest> | undefined;
  const cachedSnapshots = new Map<string, Promise<ParsedAPISnapshot<object, object>>>();
  const cachedSnapshotFiles = new Map<string, Promise<unknown>>();

  function loadSnapshotFile(url: string): Promise<unknown> {
    let pending = cachedSnapshotFiles.get(url);

    if (pending === undefined) {
      pending = loadJSON(url, fetcher).catch((error: unknown) => {
        cachedSnapshotFiles.delete(url);

        throw error;
      });
      cachedSnapshotFiles.set(url, pending);
    }

    return pending;
  }

  async function loadSnapshot(path: string): Promise<unknown> {
    const wrapper = await loadSnapshotFile(`${base}data/${path}`);

    if (
      wrapper === null ||
      typeof wrapper !== 'object' ||
      Array.isArray(wrapper) ||
      !('$ref' in wrapper)
    ) {
      return wrapper;
    }
    const reference = (wrapper as Record<string, unknown>)['$ref'];

    if (
      typeof reference !== 'string' ||
      reference.length === 0 ||
      reference.startsWith('/') ||
      reference.includes('\\') ||
      reference.split('/').some(part => part === '' || part === '.' || part === '..')
    ) {
      throw new Error('Invalid API snapshot reference');
    }

    return loadSnapshotFile(`${base}data/${reference}`);
  }

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
    locale: string,
  ): Promise<ParsedAPISnapshot<object, object>> {
    if (!locales.includes(locale)) {
      throw new Error(`Unsupported API locale: ${locale}`);
    }
    const manifest = await loadManifest();
    const pkg = manifest.packages.find(item => item.key === packageKey);
    const info = findAPIVersion(pkg, version);
    const path = info?.json[locale];

    if (info === undefined || path === undefined) {
      throw new Error(
        `Unknown API version: ${packageKey}/${version}/${locale}`,
      );
    }

    const cacheKey = `${info.snapshot}/${locale}/${version === 'current' ? 'preview' : 'release'}`;
    const pending =
      cachedSnapshots.get(cacheKey) ??
      loadSnapshot(path).then(raw =>
        parseAPISnapshot(
          raw,
          locale,
          info,
          version === 'current',
          manifest.packages,
          isLocale,
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

  return {
    locales,
    repository,
    isLocale,
    loadManifest,
    loadAPI,
    loadReadme: (key: string, locale: string) =>
      loadAPIReadmeData(key, locale, base, url => loadJSON(url, fetcher), isLocale),
  };
}

export type APISource = ReturnType<typeof createAPISource>;
