import { loadJSON } from '../data';

export interface ManualNavigationItem<TLocale extends string> {
  slug: string;
  title: Record<TLocale, string>;
  group: Record<TLocale, string>;
  parent?: string;
  format?: Readonly<Record<TLocale, ManualContentFormat>>;
  lastModified?: Readonly<Record<TLocale, string>>;
}

export type ManualContentFormat = 'markdown' | 'html';

export interface ManualHeading {
  title: string;
  level: number;
}

export interface ManualPageDocument {
  text: string;
  headings: ManualHeading[];
  format?: ManualContentFormat;
  lastModified?: string;
}

export interface ManualContentClient<TLocale extends string> {
  loadNavigation: () => Promise<ManualNavigationItem<TLocale>[]>;
  manualPages: (
    locale: TLocale,
    navigation: ManualNavigationItem<TLocale>[],
  ) => {
    slug: string;
    title: string;
    group: string;
    parent?: string;
  }[];
  loadPage: (
    locale: TLocale,
    slug: string,
    navigation: ManualNavigationItem<TLocale>[],
  ) => Promise<{
    slug: string;
    title: string;
    text: string;
    headings: ManualHeading[];
    format: ManualContentFormat;
    lastModified?: string;
  }>;
  loadOverview: (locale: TLocale) => Promise<ManualPageDocument>;
}

interface ManualContentOptions<TLocale extends string> {
  baseURL: string;
  locales: readonly TLocale[];
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
        ...text.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/giu),
      ].flatMap(match => {
        const title = match[2]
          ?.replace(/<[^>]*>/gu, '')
          .replace(/&nbsp;/giu, ' ')
          .replace(/&amp;/giu, '&')
          .replace(/&lt;/giu, '<')
          .replace(/&gt;/giu, '>')
          .trim();

        return title === undefined || title.length === 0
          ? []
          : [{ title, level: Number(match[1]) }];
      });
    }
    const document = new DOMParser().parseFromString(text, 'text/html');

    return [...document.querySelectorAll('h2, h3, h4, h5, h6')].flatMap(
      heading =>
        heading.textContent === null
          ? []
          : [
              {
                title: heading.textContent.trim(),
                level: Number(heading.tagName.slice(1)),
              },
            ],
    );
  }

  return [...text.matchAll(/^(#{2,6})\s+(.+?)\s*#*\s*$/gmu)].flatMap(match =>
    match[2] === undefined
      ? []
      : [{ title: match[2], level: match[1]?.length ?? 2 }],
  );
}

export function createManualContentClient<TLocale extends string>({
  baseURL,
  locales,
  fetcher: providedFetcher,
}: ManualContentOptions<TLocale>): ManualContentClient<TLocale> {
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  const fetcher: typeof fetch =
    providedFetcher ?? ((...args) => globalThis.fetch(...args));
  let cachedNavigation: Promise<ManualNavigationItem<TLocale>[]> | undefined;

  function isLocalized(value: unknown): value is Record<TLocale, string> {
    return (
      isRecord(value) &&
      locales.every(locale => typeof value[locale] === 'string')
    );
  }

  function isNavigation(
    value: unknown,
  ): value is ManualNavigationItem<TLocale>[] {
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
          (item['lastModified'] === undefined ||
            isLocalized(item['lastModified'])),
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

  return {
    loadNavigation() {
      if (cachedNavigation === undefined) {
        const url = `${base}data/manual/navigation.json`;

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
    },
    manualPages(locale, navigation) {
      return navigation.map(({ slug, title, group, parent }) => ({
        slug,
        title: title[locale],
        group: group[locale],
        ...(parent === undefined ? {} : { parent }),
      }));
    },
    async loadPage(locale, slug, navigation) {
      const page = navigation.find(item => item.slug === slug);

      if (page === undefined) {
        throw new Error(`Missing manual ${locale}/${slug}`);
      }

      const format = page.format?.[locale] ?? 'markdown';
      const extension = format === 'html' ? 'html' : 'md';
      const document = await loadDocument(
        `${base}data/manual/${locale}/${encodeURIComponent(slug)}.${extension}`,
        format,
      );
      const pageLastModified = page.lastModified?.[locale];

      return {
        slug,
        title: page.title[locale],
        ...document,
        format,
        ...(document.lastModified === undefined &&
        pageLastModified !== undefined
          ? { lastModified: pageLastModified }
          : {}),
      };
    },
    loadOverview(locale) {
      return loadDocument(`${base}data/manual/${locale}/index.md`);
    },
  };
}
