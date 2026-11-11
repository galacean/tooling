import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ManualHeading } from '../../manual';
import {
  BackToTopButton,
  DocumentError,
  DocumentLoading,
  DocsSidebarCollapse,
  headingId,
  HTMLDocumentContent,
  Icon,
  MarkdownContent,
} from '../shared';
import {
  buildManualNavigationGroups, flattenManualGroups, getPagesInGroups, groupManualPages,
} from './manual-navigation';
import type {
  ManualNavigationGroup, ManualNavigationNode, ManualNavigationPage,
} from './manual-navigation';
import { buildManualTocTree, flattenManualTocNodes } from './manual-toc';
import type { ManualTocNode } from './manual-toc';

export { buildManualNavigationGroups, groupManualPages };
export type { ManualNavigationPage };

export interface ManualDocument {
  text: string;
  headings: ManualHeading[];
  format?: 'markdown' | 'html';
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
  top?: string;
  mobileDirectory: string;
  expandMenu?: string;
  collapseMenu?: string;
  lastUpdated: string;
  copy: string;
  copied: string;
  copyFailed: string;
}

export interface ManualPageProps {
  locale: string;
  slug: string | undefined;
  onTitleChange?: (title: string) => void;
  onSidebarCollapsed?: (collapsed: boolean) => void;
  messages: ManualPageMessages;
  sectionLabel: string;
  homeHref: string;
  getPageHref: (slug?: string) => string;
  loadNavigation: (locale: string) => Promise<ManualNavigationPage[]>;
  loadOverview: (locale: string) => Promise<ManualDocument>;
  loadPage: (locale: string, slug: string) => Promise<ManualDocument>;
}

type ManualActionIconName = 'locate' | 'collapse' | 'expand' | 'hideOutline';

const manualActionIcons = {
  locate: 'locate',
  collapse: 'collapse',
  expand: 'expand',
  hideOutline: 'hideOutline',
} as const;

function ManualActionIcon ({ name }: { name: ManualActionIconName }) {
  return (
    <Icon name={manualActionIcons[name]} style={{ width: 16, height: 16 }} />
  );
}

export function ManualPage ({
  locale,
  slug,
  onTitleChange,
  onSidebarCollapsed,
  messages: t,
  getPageHref,
  loadNavigation,
  loadOverview,
  loadPage,
}: ManualPageProps) {
  const location = useLocation();
  const sidebarRef = useRef<HTMLElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
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
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedToc, setExpandedToc] = useState<Record<string, boolean>>({});
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isTocHidden, setIsTocHidden] = useState(false);
  const [isTocHoverSuppressed, setIsTocHoverSuppressed] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeTocId, setActiveTocId] = useState<string>();
  const pages = navigation?.locale === locale ? navigation.pages : undefined;
  const index = pages?.findIndex(page => page.slug === slug) ?? -1;
  const selected = pages?.[index];
  const groups = buildManualNavigationGroups(pages ?? []);
  const loadedPage = loaded?.locale === locale ? loaded : undefined;
  const content =
    loadedPage !== undefined && loadedPage.slug === slug
      ? loadedPage.page
      : undefined;
  const overviewContent =
    overview?.locale === locale ? overview.page : undefined;
  const failed = loadError?.locale === locale && loadError.slug === slug;
  const displayedContent =
    content ??
    (slug !== undefined && selected !== undefined && !failed
      ? loadedPage?.page
      : undefined);
  const displayedSlug =
    content !== undefined
      ? slug
      : displayedContent !== undefined
        ? loadedPage?.slug
        : slug;
  const isPageTransition =
    slug !== undefined &&
    selected !== undefined &&
    !failed &&
    content === undefined &&
    displayedContent !== undefined;
  const toc = slug === undefined ? overviewContent : displayedContent;
  const tocTree =
    toc === undefined
      ? []
      : buildManualTocTree(toc.headings, slug ?? 'overview');
  const collapsibleTocNodes = flattenManualTocNodes(tocTree).filter(
    item => item.children.length > 0,
  );
  const tocExpansionStates = collapsibleTocNodes.map(
    item => expandedToc[item.key] ?? true,
  );
  const isTocFullyCollapsed =
    tocExpansionStates.length > 0 &&
    tocExpansionStates.every(isExpanded => !isExpanded);
  const actionLabels = locale.startsWith('zh')
    ? {
      locate: '定位当前文档',
      collapseAll: '全部折叠',
      expandAll: '全部展开',
      hideOutline: '隐藏大纲',
      expandOutline: '展开大纲',
    }
    : {
      locate: 'Locate current page',
      collapseAll: 'Collapse all',
      expandAll: 'Expand all',
      hideOutline: 'Hide outline',
      expandOutline: 'Show outline',
    };
  const directoryLabel = locale.startsWith('zh') ? '目录' : t.mobileDirectory;
  const tocLabel = locale.startsWith('zh') ? '大纲' : t.contents;
  const parsedLastModified =
    displayedContent?.lastModified === undefined
      ? undefined
      : new Date(displayedContent.lastModified);
  const lastModified =
    parsedLastModified !== undefined &&
      !Number.isNaN(parsedLastModified.valueOf())
      ? parsedLastModified
      : undefined;
  const formattedLastModified =
    lastModified === undefined
      ? undefined
      : lastModified.toISOString().slice(0, 16).replace('T', ' ');
  const containsCurrentPage = (page: ManualNavigationNode): boolean =>
    page.slug === displayedSlug || page.children.some(containsCurrentPage);
  const containsCurrentGroupPage = (group: ManualNavigationGroup): boolean =>
    group.pages.some(containsCurrentPage) ||
    group.groups.some(containsCurrentGroupPage);
  const collapsibleGroups = flattenManualGroups(groups).filter(
    group => group.title !== '',
  );
  const collapsiblePages = getPagesInGroups(groups).filter(
    page => page.children.length > 0,
  );
  const expansionStates = [
    ...collapsibleGroups.map(group => expandedGroups[group.key] ?? true),
    ...collapsiblePages.map(
      page =>
        expandedPages[page.slug] ?? page.children.some(containsCurrentPage),
    ),
  ];
  const isNavigationFullyCollapsed =
    expansionStates.length > 0 &&
    expansionStates.every(isExpanded => !isExpanded);
  const navigationToggleLabel = isNavigationFullyCollapsed
    ? actionLabels.expandAll
    : actionLabels.collapseAll;
  const sidebarToggleLabel = locale.startsWith('zh')
    ? isSidebarCollapsed
      ? '展开目录'
      : '收起目录'
    : isSidebarCollapsed
      ? 'Expand directory'
      : 'Collapse directory';
  const backToTopLabel =
    t.top ?? (locale.startsWith('zh') ? '回到顶部' : 'Back to top');
  const renderTocHeading = () => (
    <div className="manual-toc-heading">
      <strong>{tocLabel}</strong>
      <div className="manual-toc-actions">
        <button
          type="button"
          className="manual-toc-action"
          aria-label={
            isTocHidden ? actionLabels.expandOutline : actionLabels.hideOutline
          }
          title={
            isTocHidden ? actionLabels.expandOutline : actionLabels.hideOutline
          }
          onClick={event => {
            const shouldHide = !isTocHidden;

            setIsTocHidden(shouldHide);
            setIsTocHoverSuppressed(shouldHide);
            setIsTocOpen(false);
            event.currentTarget.blur();
          }}
        >
          <Icon name={isTocHidden ? 'eye' : 'hideOutline'} />
        </button>
        {collapsibleTocNodes.length > 0 && (
          <button
            type="button"
            className="manual-toc-action"
            aria-label={
              isTocFullyCollapsed
                ? actionLabels.expandAll
                : actionLabels.collapseAll
            }
            title={
              isTocFullyCollapsed
                ? actionLabels.expandAll
                : actionLabels.collapseAll
            }
            aria-pressed={isTocFullyCollapsed}
            onClick={toggleTocExpansion}
          >
            <ManualActionIcon
              name={isTocFullyCollapsed ? 'expand' : 'collapse'}
            />
          </button>
        )}
      </div>
    </div>
  );
  const setNavigationExpanded = (isExpanded: boolean) => {
    setExpandedGroups(
      Object.fromEntries(
        flattenManualGroups(groups).map(group => [group.key, isExpanded]),
      ),
    );
    setExpandedPages(
      Object.fromEntries(
        collapsiblePages.map(page => [page.slug, isExpanded]),
      ),
    );
  };
  const toggleNavigation = () =>
    setNavigationExpanded(isNavigationFullyCollapsed);
  const locateCurrentPage = () => {
    setExpandedGroups(current => ({
      ...current,
      ...Object.fromEntries(
        collapsibleGroups
          .filter(containsCurrentGroupPage)
          .map(group => [group.key, true]),
      ),
    }));
    setExpandedPages(current => ({
      ...current,
      ...Object.fromEntries(
        collapsiblePages
          .filter(page => page.children.some(containsCurrentPage))
          .map(page => [page.slug, true]),
      ),
    }));

    window.setTimeout(() => {
      sidebarRef.current
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  };
  const toggleTocExpansion = () => {
    setExpandedToc(
      Object.fromEntries(
        collapsibleTocNodes.map(item => [item.key, isTocFullyCollapsed]),
      ),
    );
  };
  const getToggleLabel = (expanded: boolean, title: string) => {
    const fallback = locale.startsWith('zh')
      ? expanded
        ? '收起菜单'
        : '展开菜单'
      : expanded
        ? 'Collapse menu'
        : 'Expand menu';

    return `${expanded ? (t.collapseMenu ?? fallback) : (t.expandMenu ?? fallback)} ${title}`;
  };
  const getTocToggleLabel = (expanded: boolean, title: string) =>
    `${locale.startsWith('zh') ? (expanded ? '收起' : '展开') : expanded ? 'Collapse' : 'Expand'} ${title}`;
  const renderNavigationItems = (
    items: ManualNavigationNode[],
    className = '',
    depth = 0,
  ): ReactNode => (
    <ul className={`manual-nav-list${className === '' ? '' : ` ${className}`}`}>
      {items.map(page => {
        const hasChildren = page.children.length > 0;
        const isExpanded =
          expandedPages[page.slug] ?? page.children.some(containsCurrentPage);

        return (
          <li key={page.slug}>
            <div
              className="manual-nav-row"
              style={
                { '--manual-nav-depth': `${depth * 24}px` } as CSSProperties
              }
            >
              <Link
                to={getPageHref(page.slug)}
                aria-current={page.slug === displayedSlug ? 'page' : undefined}
                title={page.title}
              >
                <span className="manual-nav-item-indent" aria-hidden="true" />
                <span className="manual-nav-item-title">{page.title}</span>
              </Link>
              {hasChildren && (
                <button
                  type="button"
                  className="manual-nav-toggle"
                  aria-label={getToggleLabel(isExpanded, page.title)}
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpandedPages(current => ({
                      ...current,
                      [page.slug]: !isExpanded,
                    }))
                  }
                >
                  <Icon
                    name="chevronDown"
                    className="manual-nav-toggle-icon"
                    style={{ width: 16, height: 16 }}
                  />
                </button>
              )}
            </div>
            {hasChildren &&
              isExpanded &&
              renderNavigationItems(page.children, '', depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  function renderNavigationGroup (
    group: ManualNavigationGroup,
    depth = 0,
  ): ReactNode {
    const isExpanded = expandedGroups[group.key] ?? true;

    return (
      <section className="manual-nav-group" key={group.key || 'ungrouped'}>
        {group.title !== '' && (
          <button
            type="button"
            className="manual-nav-group-heading"
            data-current={containsCurrentGroupPage(group) ? 'true' : undefined}
            aria-label={getToggleLabel(isExpanded, group.title)}
            aria-expanded={isExpanded}
            style={{ '--manual-nav-depth': `${depth * 24}px` } as CSSProperties}
            onClick={() =>
              setExpandedGroups(current => ({
                ...current,
                [group.key]: !isExpanded,
              }))
            }
          >
            <span className="manual-nav-group-surface">
              <span className="manual-nav-group-chevron" aria-hidden="true">
                <Icon name="chevronDown" style={{ width: 16, height: 16 }} />
              </span>
              <span className="manual-nav-group-title">{group.title}</span>
            </span>
          </button>
        )}
        {(group.title === '' || isExpanded) && (
          <>
            {renderNavigationItems(
              group.pages,
              'manual-nav-group-pages',
              depth,
            )}
            {group.groups.map(child =>
              renderNavigationGroup(child, depth + 1),
            )}
          </>
        )}
      </section>
    );
  }
  const renderTocItems = (items: ManualTocNode[], depth = 0): ReactNode => (
    <ul className="manual-toc-list">
      {items.map(item => {
        const hasChildren = item.children.length > 0;
        const isExpanded = expandedToc[item.key] ?? true;
        const id = headingId(item.title);

        return (
          <li key={item.key}>
            <div
              className="manual-toc-row"
              data-level={item.level}
              data-depth={depth}
              data-current={activeTocId === id ? 'true' : undefined}
              style={
                { '--manual-toc-depth': `${depth * 34}px` } as CSSProperties
              }
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="manual-toc-toggle"
                  aria-label={getTocToggleLabel(isExpanded, item.title)}
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpandedToc(current => ({
                      ...current,
                      [item.key]: !isExpanded,
                    }))
                  }
                >
                  <Icon
                    name="chevronDownFill"
                    style={{ width: 16, height: 16 }}
                  />
                </button>
              ) : depth === 0 ? (
                <span className="manual-toc-spacer" aria-hidden="true" />
              ) : null}
              <Link
                className="manual-toc-link"
                aria-current={activeTocId === id ? 'location' : undefined}
                to={`${location.pathname}#${id}`}
                onClick={event => {
                  setIsTocOpen(false);
                  event.currentTarget.blur();
                }}
              >
                {item.title}
              </Link>
            </div>
            {hasChildren &&
              isExpanded &&
              renderTocItems(item.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

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
    if (pages !== undefined && !isPageTransition) {
      onTitleChange?.(
        slug === undefined ? t.manual : (selected?.title ?? t.notFound),
      );
    }
  }, [
    isPageTransition,
    onTitleChange,
    pages,
    selected,
    slug,
    t.manual,
    t.notFound,
  ]);
  useEffect(() => {
    onSidebarCollapsed?.(isSidebarCollapsed);
  }, [isSidebarCollapsed, onSidebarCollapsed]);
  useEffect(() => {
    if (location.hash !== '') {
      document
        .getElementById(decodeURIComponent(location.hash.slice(1)))
        ?.scrollIntoView();
    }
  }, [location.hash, location.pathname, toc]);
  useEffect(() => {
    const updateActiveHeading = () => {
      const headings = flattenManualTocNodes(
        buildManualTocTree(toc?.headings ?? [], slug ?? 'overview'),
      )
        .map(item => document.getElementById(headingId(item.title)))
        .filter((heading): heading is HTMLElement => heading !== null);

      if (headings.length === 0) {
        setActiveTocId(current =>
          current === undefined ? current : undefined,
        );

        return;
      }
      const marker = window.innerHeight * 0.3;
      const activeHeading =
        [...headings]
          .reverse()
          .find(heading => heading.getBoundingClientRect().top <= marker) ??
        headings[0];

      const activeId = activeHeading?.id;

      setActiveTocId(current => (current === activeId ? current : activeId));
    };
    let updateTimeout: number | undefined;
    const scheduleActiveHeadingUpdate = () => {
      if (updateTimeout !== undefined) {
        return;
      }

      updateTimeout = window.setTimeout(() => {
        updateTimeout = undefined;
        updateActiveHeading();
      }, 16);
    };

    updateActiveHeading();
    const article = articleRef.current;
    const layout = article?.closest<HTMLElement>('.docs-layout');
    const scrollTargets = [article, layout].filter(
      (target): target is HTMLElement =>
        target !== null && target !== undefined,
    );

    scrollTargets.forEach(target => {
      target.addEventListener('scroll', scheduleActiveHeadingUpdate, {
        passive: true,
      });
    });
    window.addEventListener('resize', scheduleActiveHeadingUpdate);

    return () => {
      if (updateTimeout !== undefined) {
        window.clearTimeout(updateTimeout);
      }
      scrollTargets.forEach(target => {
        target.removeEventListener('scroll', scheduleActiveHeadingUpdate);
      });
      window.removeEventListener('resize', scheduleActiveHeadingUpdate);
    };
  }, [location.hash, location.pathname, slug, toc]);

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
  const displayedIndex =
    displayedSlug === undefined
      ? index
      : pages.findIndex(page => page.slug === displayedSlug);
  const previous = pages[displayedIndex - 1];
  const next = pages[displayedIndex + 1];
  const displayedPageTitle =
    pages.find(page => page.slug === displayedSlug)?.title ??
    selected?.title ??
    t.notFound;

  return (
    <main
      className={`docs-layout${isTocHidden ? ' no-toc' : ''}${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}
    >
      {slug !== undefined && (
        <details className="mobile-directory">
          <summary>{directoryLabel}</summary>
          <nav>
            <div className="mobile-directory-actions">
              <button
                type="button"
                className="manual-sidebar-action"
                aria-label={actionLabels.locate}
                title={actionLabels.locate}
                onClick={locateCurrentPage}
              >
                <ManualActionIcon name="locate" />
              </button>
              <button
                type="button"
                className="manual-sidebar-action"
                aria-label={navigationToggleLabel}
                title={navigationToggleLabel}
                aria-pressed={isNavigationFullyCollapsed}
                onClick={toggleNavigation}
              >
                <ManualActionIcon
                  name={isNavigationFullyCollapsed ? 'expand' : 'collapse'}
                />
              </button>
            </div>
            {groups.map(group => renderNavigationGroup(group))}
          </nav>
        </details>
      )}
      <aside className="manual-sidebar" id="manual-sidebar" ref={sidebarRef}>
        <div className="manual-sidebar-label">
          <div className="manual-sidebar-label-title">
            <Icon name="directory" className="manual-sidebar-label-icon" />
            <span>{directoryLabel}</span>
          </div>
          <div className="manual-sidebar-actions">
            {slug !== undefined ? (
              <button
                type="button"
                className="manual-sidebar-action"
                aria-label={actionLabels.locate}
                title={actionLabels.locate}
                onClick={locateCurrentPage}
              >
                <ManualActionIcon name="locate" />
              </button>
            ) : (
              <span
                className="manual-sidebar-action-spacer"
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              className="manual-sidebar-action"
              aria-label={navigationToggleLabel}
              title={navigationToggleLabel}
              aria-pressed={isNavigationFullyCollapsed}
              onClick={toggleNavigation}
            >
              <ManualActionIcon
                name={isNavigationFullyCollapsed ? 'expand' : 'collapse'}
              />
            </button>
          </div>
        </div>
        <nav
          className="manual-sidebar-nav docs-scroll-area"
          ref={sidebarRef}
          aria-label={directoryLabel}
        >
          {groups.map(group => renderNavigationGroup(group))}
        </nav>
      </aside>
      <DocsSidebarCollapse
        label={sidebarToggleLabel}
        expanded={!isSidebarCollapsed}
        controlsId="manual-sidebar"
        className="docs-sidebar-collapse-region--manual"
        onToggle={() => setIsSidebarCollapsed(value => !value)}
      />
      <article
        className="manual-article docs-scroll-area"
        ref={articleRef}
        aria-busy={isPageTransition}
      >
        <div className="manual-article-content">
          {slug === undefined ? (
            <>
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
          ) : displayedContent === undefined ? (
            <DocumentLoading label={t.loading} />
          ) : (
            <>
              {displayedContent.format === 'html' ? (
                <>
                  {!/<h1(?:\s|>)/iu.test(displayedContent.text) && (
                    <h1>{displayedPageTitle}</h1>
                  )}
                  <HTMLDocumentContent html={displayedContent.text} />
                </>
              ) : (
                <MarkdownContent
                  text={displayedContent.text}
                  copyLabel={t.copy}
                  copied={t.copied}
                  copyFailed={t.copyFailed}
                />
              )}
              {formattedLastModified !== undefined &&
                lastModified !== undefined && (
                  <div className="manual-article-updated">
                    <Icon name="clock" />
                    <time
                      dateTime={lastModified.toISOString()}
                      aria-label={`${t.lastUpdated}: ${formattedLastModified}`}
                    >
                      {formattedLastModified}
                    </time>
                  </div>
                )}
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
        </div>
      </article>
      <BackToTopButton label={backToTopLabel} scrollRef={articleRef} />
      <aside
        className={`manual-toc docs-scroll-area${isTocOpen ? ' is-open' : ''}${isTocHidden ? ' is-hidden' : ''
          }${isTocHoverSuppressed ? ' is-hover-suppressed' : ''}`}
        aria-label={tocLabel}
        onPointerEnter={() => setIsTocHoverSuppressed(false)}
        onPointerLeave={() => setIsTocHoverSuppressed(false)}
        onWheel={event => {
          if (event.deltaY === 0) {
            return;
          }
          const panel = event.currentTarget.classList.contains('is-hidden')
            ? event.currentTarget.querySelector<HTMLElement>(
              '.manual-toc-panel',
            )
            : null;
          const scrollArea =
            panel !== null &&
              window.getComputedStyle(panel).overflowY === 'auto'
              ? panel
              : event.currentTarget;
          const scrollStyle = window.getComputedStyle(scrollArea);
          const outlineOverflows =
            (scrollStyle.overflowY === 'auto' ||
              scrollStyle.overflowY === 'scroll') &&
            scrollArea.scrollHeight > scrollArea.clientHeight;

          if (outlineOverflows) {
            return;
          }
          const article = articleRef.current;

          if (article !== null) {
            article.scrollBy({ top: event.deltaY, behavior: 'auto' });
          }
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.currentTarget.querySelector<HTMLElement>(':focus')?.blur();
            setIsTocOpen(false);
          }
        }}
      >
        {toc !== undefined && (
          <>
            {isTocHidden && (
              <div className="manual-toc-small-head">{renderTocHeading()}</div>
            )}
            {!isTocHidden && (
              <button
                type="button"
                className="manual-toc-trigger"
                aria-label={getTocToggleLabel(isTocOpen, tocLabel)}
                aria-expanded={isTocOpen}
                aria-controls="manual-toc-panel"
                onClick={event => {
                  const nextOpen = !isTocOpen;

                  setIsTocOpen(nextOpen);
                  if (!nextOpen) {
                    event.currentTarget.blur();
                  }
                }}
              >
                <Icon
                  name="chevronRight"
                  className="manual-toc-trigger-icon"
                  style={{ width: 16, height: 16 }}
                />
                <span className="manual-toc-trigger-label" aria-hidden="true">
                  {tocLabel}
                </span>
              </button>
            )}
            <div
              className="manual-toc-panel docs-scroll-area"
              id="manual-toc-panel"
            >
              {!isTocHidden && renderTocHeading()}
              {renderTocItems(tocTree)}
            </div>
          </>
        )}
      </aside>
    </main>
  );
}
