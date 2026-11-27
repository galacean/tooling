import { withTrailingSlash } from '../config/urls';
import { loadJSON } from '../data/load-resource';
import { manualAlternateLocales } from './document';
import type { ManualContentFormat, ManualHeading, ManualNavigationItem, ManualNavigationPage, ManualPageDocument } from './document';

export interface ManualSource {
  loadNavigation: (locale: string) => Promise<ManualNavigationPage[]>;
  loadOverview: (locale: string) => Promise<ManualPageDocument>;
  loadPage: (locale: string, slug: string) => Promise<ManualPageDocument>;
  assetHref?: (locale: string, path: string) => string;
}

interface ManualSourceOptions {
  baseURL: string;
  manualDataURL?: string;
  locales: readonly string[];
  fetcher?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFormatMap(
  value: unknown,
  locales: readonly string[],
): value is Record<string, ManualContentFormat> {
  return (
    isRecord(value) &&
    locales.every(
      locale => value[locale] === 'markdown' || value[locale] === 'html',
    )
  );
}

function extractHeadings(
  text: string,
  format: ManualContentFormat,
): ManualHeading[] {
  if (format === 'html') {
    if (typeof DOMParser === 'undefined') {
      return [
        ...text.matchAll(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1\s*>/giu),
      ].flatMap(match => {
        const title = match[3]
          ?.replace(/<[^>]*>/gu, '')
          .replace(/&nbsp;/giu, ' ')
          .replace(/&amp;/giu, '&')
          .replace(/&lt;/giu, '<')
          .replace(/&gt;/giu, '>')
          .trim();
        const idMatch = match[2]?.match(
          /\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu,
        );
        const id = idMatch?.[1] ?? idMatch?.[2] ?? idMatch?.[3];

        return title === undefined || title.length === 0
          ? []
          : [
              {
                title,
                level: Number(match[1]),
                ...(id === undefined || id.length === 0 ? {} : { id }),
              },
            ];
      });
    }
    const document = new DOMParser().parseFromString(text, 'text/html');

    return [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].flatMap(
      heading =>
        heading.textContent === null
          ? []
          : [
              {
                title: heading.textContent.trim(),
                level: Number(heading.tagName.slice(1)),
                ...(heading.id === '' ? {} : { id: heading.id }),
              },
            ],
    );
  }

  return [...text.matchAll(/^(#{1,6})\s+(.+?)\s*#*\s*$/gmu)].flatMap(match =>
    match[2] === undefined
      ? []
      : [{ title: match[2], level: match[1]?.length ?? 2 }],
  );
}

export function createManualSource({
  baseURL,
  manualDataURL,
  locales,
  fetcher: providedFetcher,
}: ManualSourceOptions): ManualSource {
  const base = withTrailingSlash(baseURL);
  const manualBaseURL =
    withTrailingSlash(manualDataURL ?? `${base}data/manual/`);
  const fetcher: typeof fetch =
    providedFetcher ?? ((...args) => globalThis.fetch(...args));
  let cachedNavigation: Promise<ManualNavigationItem<string>[]> | undefined;

  function isLocalized(value: unknown): value is Record<string, string> {
    return (
      isRecord(value) &&
      locales.every(locale => typeof value[locale] === 'string')
    );
  }

  function isNavigation(
    value: unknown,
  ): value is ManualNavigationItem<string>[] {
    return (
      Array.isArray(value) &&
      value.every(
        item =>
          isRecord(item) &&
          typeof item['slug'] === 'string' &&
          isLocalized(item['title']) &&
          isLocalized(item['group']) &&
          (item['parent'] === undefined ||
            typeof item['parent'] === 'string') &&
          (item['format'] === undefined ||
            isFormatMap(item['format'], locales)) &&
          (item['contentLocales'] === undefined || (isLocalized(item['contentLocales']) && Object.values(item['contentLocales']).every(value => typeof value === 'string' && locales.includes(value)))) &&
          (item['translationStatus'] === undefined || (isLocalized(item['translationStatus']) && Object.values(item['translationStatus']).every(value => ['source', 'translated', 'missing', 'needs-review'].includes(String(value))))) &&
          (item['lastModified'] === undefined ||
            (isRecord(item['lastModified']) && Object.entries(item['lastModified']).every(([key, value]) => locales.includes(key) && typeof value === 'string'))),
      )
    );
  }

  async function loadDocument(
    url: string,
    format: ManualContentFormat = 'markdown',
  ): Promise<ManualPageDocument> {
    const response = await fetcher(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }

    const text = await response.text();
    const lastModified = response.headers.get('Last-Modified');

    return {
      text,
      headings: extractHeadings(text, format),
      format,
      ...(lastModified === null ? {} : { lastModified }),
    };
  }

  function navigationData() {
    if (cachedNavigation === undefined) {
      const url = `${manualBaseURL}navigation.json`;

      cachedNavigation = loadJSON(url, fetcher)
        .then(raw => {
          if (!isNavigation(raw)) {
            throw new Error('Invalid manual navigation data');
          }

          return raw;
        })
        .catch((error: unknown) => {
          cachedNavigation = undefined;

          throw error;
        });
    }

    return cachedNavigation;
  }

  function checkLocale(locale: string) {
    if (!locales.includes(locale)) {
      throw new Error(`Unsupported manual locale: ${locale}`);
    }
  }

  return {
    assetHref: (locale, path) => manualBaseURL + encodeURIComponent(locale) + '/' + path,
    async loadNavigation(locale) {
      checkLocale(locale);
      const navigation = await navigationData();

      return navigation.map(({ slug, title, group, parent, contentLocales }) => ({
        ...(contentLocales === undefined ? {} : { alternateLocales: manualAlternateLocales(locales, contentLocales) }),
        slug,
        title: title[locale]!,
        group: group[locale]!,
        ...(parent === undefined ? {} : { parent }),
      }));
    },
    async loadPage(locale, slug) {
      checkLocale(locale);
      const navigation = await navigationData();
      const page = navigation.find(item => item.slug === slug);

      if (page === undefined) {
        throw new Error(`Missing manual ${locale}/${slug}`);
      }

      const format = page.format?.[locale] ?? 'markdown';
      const extension = format === 'html' ? 'html' : 'md';
      const document = await loadDocument(
        `${manualBaseURL}${locale}/${encodeURIComponent(slug)}.${extension}`,
        format,
      );
      const pageLastModified = page.lastModified?.[locale];

      return {
        slug,
        title: page.title[locale],
        ...document,
        contentLocale: page.contentLocales?.[locale] ?? locale,
        translationStatus: page.translationStatus?.[locale] ?? 'source',
        format,
        ...(document.lastModified === undefined &&
        pageLastModified !== undefined
          ? { lastModified: pageLastModified }
          : {}),
      };
    },
    async loadOverview(locale) {
      checkLocale(locale);

      return loadDocument(`${manualBaseURL}${locale}/index.md`);
    },
  };
}
