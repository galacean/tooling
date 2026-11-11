import { loadJSON } from '../data';

export interface ManualNavigationItem<TLocale extends string> {
  slug: string;
  title: Record<TLocale, string>;
  group: Record<TLocale, string>;
  lastModified?: Readonly<Record<TLocale, string>>;
}

export interface ManualPageDocument {
  text: string;
  headings: string[];
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
  }[];
  loadPage: (
    locale: TLocale,
    slug: string,
    navigation: ManualNavigationItem<TLocale>[],
  ) => Promise<{
    slug: string;
    title: string;
    text: string;
    headings: string[];
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

function extractHeadings(text: string): string[] {
  return [...text.matchAll(/^## (.+)$/gmu)].flatMap(match =>
    match[1] === undefined ? [] : [match[1]],
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
          (item['lastModified'] === undefined ||
            isLocalized(item['lastModified'])),
      )
    );
  }

  async function loadMarkdown(url: string): Promise<ManualPageDocument> {
    const response = await fetcher(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }

    const text = await response.text();
    const lastModified = response.headers.get('Last-Modified');

    return {
      text,
      headings: extractHeadings(text),
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
      return navigation.map(({ slug, title, group }) => ({
        slug,
        title: title[locale],
        group: group[locale],
      }));
    },
    async loadPage(locale, slug, navigation) {
      const page = navigation.find(item => item.slug === slug);

      if (page === undefined) {
        throw new Error(`Missing manual ${locale}/${slug}`);
      }

      const url = `${base}data/manual/${locale}/${encodeURIComponent(slug)}.md`;
      const document = await loadMarkdown(url);
      const pageLastModified = page.lastModified?.[locale];

      return {
        slug,
        title: page.title[locale],
        ...document,
        ...(document.lastModified === undefined && pageLastModified !== undefined
          ? { lastModified: pageLastModified }
          : {}),
      };
    },
    loadOverview(locale) {
      return loadMarkdown(`${base}data/manual/${locale}/index.md`);
    },
  };
}
