import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  DocumentError,
  DocumentLoading,
  headingId,
  MarkdownContent,
} from '../shared';

export interface ManualNavigationPage {
  slug: string;
  title: string;
  group: string;
}

export interface ManualDocument {
  text: string;
  headings: string[];
  lastModified?: string;
}

export interface ManualPageMessages {
  home: string;
  manual: string;
  manualIntro: string;
  loading: string;
  loadError: string;
  loadErrorDescription: string;
  notFound: string;
  previous: string;
  next: string;
  contents: string;
  mobileDirectory: string;
  lastUpdated: string;
  copy: string;
  copied: string;
  copyFailed: string;
}

export interface ManualPageProps {
  locale: string;
  slug: string | undefined;
  messages: ManualPageMessages;
  sectionLabel: string;
  homeHref: string;
  getPageHref: (slug?: string) => string;
  loadNavigation: (locale: string) => Promise<ManualNavigationPage[]>;
  loadOverview: (locale: string) => Promise<ManualDocument>;
  loadPage: (locale: string, slug: string) => Promise<ManualDocument>;
}

export function groupManualPages(pages: ManualNavigationPage[]) {
  const groups = new Map<string, ManualNavigationPage[]>();

  for (const page of pages) {
    groups.set(page.group, [...(groups.get(page.group) ?? []), page]);
  }

  return [...groups].map(([title, items]) => ({ title, pages: items }));
}

export function ManualPage({
  locale,
  slug,
  messages: t,
  sectionLabel,
  homeHref,
  getPageHref,
  loadNavigation,
  loadOverview,
  loadPage,
}: ManualPageProps) {
  const location = useLocation();
  const [navigation, setNavigation] = useState<{
    locale: string;
    pages: ManualNavigationPage[];
  }>();
  const [navigationError, setNavigationError] = useState<string>();
  const [loaded, setLoaded] = useState<{
    locale: string;
    slug: string;
    page: ManualDocument;
  }>();
  const [loadError, setLoadError] = useState<{
    locale: string;
    slug: string;
  }>();
  const [overview, setOverview] = useState<{
    locale: string;
    page: ManualDocument;
  }>();
  const [overviewError, setOverviewError] = useState<string>();
  const pages = navigation?.locale === locale ? navigation.pages : undefined;
  const index = pages?.findIndex(page => page.slug === slug) ?? -1;
  const selected = pages?.[index];
  const groups = groupManualPages(pages ?? []);
  const content =
    loaded?.locale === locale && loaded.slug === slug ? loaded.page : undefined;
  const overviewContent =
    overview?.locale === locale ? overview.page : undefined;
  const toc = slug === undefined ? overviewContent : content;
  const failed = loadError?.locale === locale && loadError.slug === slug;
  const parsedLastModified = content?.lastModified === undefined
    ? undefined
    : new Date(content.lastModified);
  const lastModified = parsedLastModified !== undefined && !Number.isNaN(parsedLastModified.valueOf())
    ? parsedLastModified
    : undefined;
  const formattedLastModified = lastModified === undefined
    ? undefined
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(lastModified);

  useEffect(() => {
    let cancelled = false;

    setNavigationError(undefined);
    void loadNavigation(locale)
      .then(value => {
        if (!cancelled) {
          setNavigation({ locale, pages: value });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNavigationError(locale);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [locale, loadNavigation]);
  useEffect(() => {
    if (slug !== undefined) {
      return;
    }
    let cancelled = false;

    setOverviewError(undefined);
    void loadOverview(locale)
      .then(page => {
        if (!cancelled) {
          setOverview({ locale, page });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOverviewError(locale);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [locale, slug, loadOverview]);
  useEffect(() => {
    if (slug === undefined || selected === undefined) {
      return;
    }
    let cancelled = false;

    setLoadError(undefined);
    void loadPage(locale, slug)
      .then(page => {
        if (!cancelled) {
          setLoaded({ locale, slug, page });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError({ locale, slug });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [locale, slug, selected, loadPage]);
  useEffect(() => {
    if (location.hash !== '') {
      document
        .getElementById(decodeURIComponent(location.hash.slice(1)))
        ?.scrollIntoView();
    }
  }, [location.hash, location.pathname, toc]);

  if (navigationError === locale) {
    return (
      <DocumentError
        title={t.loadError}
        description={t.loadErrorDescription}
        layout="page"
      />
    );
  }
  if (pages === undefined) {
    return <DocumentLoading layout="manual" label={t.loading} />;
  }
  const previous = pages[index - 1];
  const next = pages[index + 1];

  return (
    <main className="docs-layout">
      {slug !== undefined && (
        <details className="mobile-directory">
          <summary>{t.mobileDirectory}</summary>
          <nav>
            {groups
              .flatMap(group => group.pages)
              .map(page => (
                <Link key={page.slug} to={getPageHref(page.slug)}>
                  {page.title}
                </Link>
              ))}
          </nav>
        </details>
      )}
      <aside className="manual-sidebar">
        <div className="manual-sidebar-label">
          <span>{sectionLabel}</span>
          <span>{locale.toUpperCase()}</span>
        </div>
        {groups.map(group => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            {group.pages.map(page => (
              <Link
                key={page.slug}
                to={getPageHref(page.slug)}
                aria-current={page.slug === slug ? 'page' : undefined}
              >
                {page.title}
              </Link>
            ))}
          </section>
        ))}
      </aside>
      <article className="manual-article">
        {slug === undefined ? (
          <>
            <div className="breadcrumb">
              <Link to={homeHref}>{t.home}</Link>
              <span>/</span>
              <span>{t.manual}</span>
            </div>
            <span className="manual-article-label">{sectionLabel}</span>
            <h1>{t.manual}</h1>
            <p className="intro">{t.manualIntro}</p>
            {overviewError === locale ? (
              <DocumentError
                title={t.loadError}
                description={t.loadErrorDescription}
                heading="h2"
              />
            ) : overviewContent === undefined ? (
              <DocumentLoading label={t.loading} />
            ) : (
              <MarkdownContent
                text={overviewContent.text}
                copyLabel={t.copy}
                copied={t.copied}
                copyFailed={t.copyFailed}
              />
            )}
          </>
        ) : selected === undefined ? (
          <>
            <h1>{t.notFound}</h1>
            <Link to={getPageHref()}>{t.manual}</Link>
          </>
        ) : failed ? (
          <DocumentError
            title={t.loadError}
            description={t.loadErrorDescription}
          />
        ) : content === undefined ? (
          <DocumentLoading label={t.loading} />
        ) : (
          <>
            <div className="breadcrumb">
              <Link to={getPageHref()}>{t.manual}</Link>
              <span>/</span>
              <span>{selected.title}</span>
            </div>
            <span className="manual-article-label">
              {slug.replaceAll('-', ' ').toUpperCase()}
            </span>
            <MarkdownContent
              text={content.text}
              copyLabel={t.copy}
              copied={t.copied}
              copyFailed={t.copyFailed}
              afterFirstHeading={formattedLastModified !== undefined && lastModified !== undefined ? (
                <span className="manual-article-updated">
                  {t.lastUpdated}{' '}
                  <time dateTime={lastModified.toISOString()}>{formattedLastModified}</time>
                </span>
              ) : undefined}
            />
            <nav className="manual-pagination">
              {previous !== undefined && (
                <Link to={getPageHref(previous.slug)}>
                  {t.previous} · {previous.title}
                </Link>
              )}
              {next !== undefined && (
                <Link to={getPageHref(next.slug)}>
                  {t.next} · {next.title}
                </Link>
              )}
            </nav>
          </>
        )}
      </article>
      <aside className="manual-toc">
        {toc !== undefined && (
          <>
            <strong>{t.contents}</strong>
            {toc.headings.map(heading => (
              <Link
                key={heading}
                to={`${location.pathname}#${headingId(heading)}`}
              >
                {heading}
              </Link>
            ))}
          </>
        )}
      </aside>
    </main>
  );
}
