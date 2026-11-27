import { resolveManualLink } from './manual-links';
import { DocumentBoundary } from '../../providers/root';
import { useDocsI18n } from '../../providers/i18n';
import { getLocaleDefinition } from '../../i18n/registry';
import { getCommonMessages } from '../../i18n/messages';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { DocsLink as Link, useDocsLocation as useLocation } from '../../routing/navigation';
import { DocsNavigationProvider } from '../../routing/navigation';
import type { DocsNavigation } from '../../routing/navigation';
import { useManualContent } from './use-manual-content';
import type { ManualSource } from '../../manual/source';
import type { MarkdownMessages } from '../shared/markdown';
import { findDocumentAnchor } from '../shared/document-anchor';
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
  buildManualNavigationGroups,
  flattenManualGroups,
  getPagesInGroups,
} from './manual-navigation';
import type {
  ManualNavigationGroup,
  ManualNavigationNode,
} from './manual-navigation';
import { buildManualTocTree, flattenManualTocNodes } from './manual-toc';
import type { ManualTocNode } from './manual-toc';

export interface ManualPageMessages extends Partial<MarkdownMessages> {
  manual: string;
  manualIntro: string;
  fallbackNotice?: string;
  loading: string;
  loadError: string;
  loadErrorDescription: string;
  notFound: string;
  previous: string;
  next: string;
  contents: string;
  top: string;
  mobileDirectory: string;
  locateCurrentPage: string;
  collapseAll: string;
  expandAll: string;
  hideOutline: string;
  expandOutline: string;
  collapseDirectory: string;
  expandDirectory: string;
  expandMenu: string;
  collapseMenu: string;
  expand: string;
  collapse: string;
  lastUpdated: string;
  copy: string;
  copied: string;
  copyFailed: string;
}

export interface ManualPageProps extends ManualSource {
  navigation?: DocsNavigation | undefined;
  locale: string;
  slug?: string | undefined;
  onContentLocalesChange?: ((locales: string[] | undefined) => void) | undefined;
  onTitleChange?: ((title: string) => void) | undefined;
  onSidebarCollapsed?: ((collapsed: boolean) => void) | undefined;
  messages: ManualPageMessages;
  getPageHref: (slug?: string, anchor?: string) => string;
}

type ManualActionIconName = 'locate' | 'collapse' | 'expand' | 'hideOutline';

const manualActionIcons = {
  locate: 'locate',
  collapse: 'collapse',
  expand: 'expand',
  hideOutline: 'hideOutline',
} as const;

function ManualActionIcon({ name }: { name: ManualActionIconName }) {
  return (
    <Icon name={manualActionIcons[name]} style={{ width: 16, height: 16 }} />
  );
}

/** Controlled manual view. URL parsing and navigation policy belong to the application. */
export function ManualPage(props: ManualPageProps) {
  return (
    <DocsNavigationProvider navigation={props.navigation}>
      <DocumentBoundary locale={props.locale}>
        <ManualPageContent {...props} />
      </DocumentBoundary>
    </DocsNavigationProvider>
  );
}

function ManualPageContent(props: ManualPageProps) {
  const {
    locale, slug, onTitleChange, onContentLocalesChange, onSidebarCollapsed,
    messages: t, getPageHref, assetHref,
  } = props;
  const {
    pages, selected, navigationFailed, overviewContent, overviewFailed,
    displayedContent, displayedSlug, pageFailed, isPageTransition,
  } = useManualContent(locale, slug, props);
  const i18n = useDocsI18n();
  const location = useLocation();
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarId = useId();
  const tocId = useId();
  const articleRef = useRef<HTMLElement | null>(null);
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
  const selectedAlternates = selected?.alternateLocales;

  useEffect(() => {
    if (pages !== undefined) {
      onContentLocalesChange?.(selectedAlternates);
    }
  }, [pages, selectedAlternates, onContentLocalesChange]);
  const groups = buildManualNavigationGroups(pages ?? []);
  const resourceHref = assetHref && ((path: string) => assetHref(locale, path));
  const resolveLink = (raw: string) => resolveManualLink(raw, displayedSlug, pages, getPageHref, resourceHref);
  const resolveImage = (raw: string) => {
    const link = resolveManualLink(raw, displayedSlug, pages, getPageHref, resourceHref, true);

    return typeof link === 'string' ? link : link.resource;
  };
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
      : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(lastModified);
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
    ? t.expandAll
    : t.collapseAll;
  const sidebarToggleLabel = isSidebarCollapsed
    ? t.expandDirectory
    : t.collapseDirectory;
  const renderTocHeading = () => (
    <div className="manual-toc-heading">
      <strong>{t.contents}</strong>
      <div className="manual-toc-actions">
        <button
          type="button"
          className="manual-toc-action"
          aria-label={
            isTocHidden ? t.expandOutline : t.hideOutline
          }
          title={
            isTocHidden ? t.expandOutline : t.hideOutline
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
                ? t.expandAll
                : t.collapseAll
            }
            title={
              isTocFullyCollapsed
                ? t.expandAll
                : t.collapseAll
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
      Object.fromEntries(collapsiblePages.map(page => [page.slug, isExpanded])),
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
  const getToggleLabel = (expanded: boolean, title: string) =>
    `${expanded ? t.collapseMenu : t.expandMenu} ${title}`;
  const getTocToggleLabel = (expanded: boolean, title: string) =>
    `${expanded ? t.collapse : t.expand} ${title}`;
  const renderNavigationItems = (
    items: ManualNavigationNode[],
    className = '',
    depth = 0,
    key?: string,
  ): ReactNode => (
    <ul
      key={key}
      className={`manual-nav-list${className === '' ? '' : ` ${className}`}`}
    >
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

  function renderNavigationGroup(
    group: ManualNavigationGroup,
    depth = 0,
  ): ReactNode {
    if (group.title === '') {
      return renderNavigationItems(
        group.pages,
        'manual-nav-root-pages',
        depth,
        group.key,
      );
    }
    const isExpanded = expandedGroups[group.key] ?? true;

    return (
      <section className="manual-nav-group" key={group.key || 'ungrouped'}>
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
        {isExpanded &&
          group.items.map(item =>
            'slug' in item
              ? renderNavigationItems(
                  [item],
                  'manual-nav-group-pages',
                  depth,
                  item.slug,
                )
              : renderNavigationGroup(item, depth + 1),
          )}
      </section>
    );
  }
  const renderTocItems = (items: ManualTocNode[], depth = 0): ReactNode => (
    <ul className="manual-toc-list">
      {items.map(item => {
        const hasChildren = item.children.length > 0;
        const isExpanded = expandedToc[item.key] ?? true;
        const id = item.id ?? headingId(item.title);

        return (
          <li key={item.key}>
            <div
              className="manual-toc-row"
              data-level={item.level}
              data-depth={depth}
              data-current={activeTocId === id ? 'true' : undefined}
              style={
                { '--manual-toc-depth': `${depth * 17}px` } as CSSProperties
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
              ) : (
                <span className="manual-toc-spacer" aria-hidden="true" />
              )}
              <Link
                className="manual-toc-link"
                aria-current={activeTocId === id ? 'location' : undefined}
                to={getPageHref(displayedSlug, id)}
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
  useLayoutEffect(() => {
    if (articleRef.current !== null) {
      articleRef.current.scrollTop = 0;
    }
  }, [locale, slug]);
  useEffect(() => {
    if (location.hash === '') {
      return;
    }
    let id: string;

    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return;
    }
    findDocumentAnchor(articleRef.current, id)?.scrollIntoView();
  }, [location.hash, location.pathname, toc]);
  useEffect(() => {
    const headingIds = new Set((toc?.headings ?? [])
      .filter(item => item.title.trim() !== '')
      .map(item => item.id ?? headingId(item.title)));
    const updateActiveHeading = () => {
      const headings = Array.from(articleRef.current?.querySelectorAll<HTMLElement>('[id]') ?? [])
        .filter(element => headingIds.has(element.id));

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
    const layout = article?.closest<HTMLElement>('.manual-layout');
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
  }, [location.hash, location.pathname, toc]);

  if (navigationFailed) {
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
  const displayedIndex = pages.findIndex(page => page.slug === displayedSlug);
  const previous = pages[displayedIndex - 1];
  const next = pages[displayedIndex + 1];
  const displayedPageTitle =
    pages[displayedIndex]?.title ??
    selected?.title ??
    t.notFound;

  return (
    <main
      className={`manual-layout${isTocHidden ? ' is-toc-hidden' : ''}${isSidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}
    >
      {slug !== undefined && (
        <details className="manual-mobile-directory">
          <summary>{t.mobileDirectory}</summary>
          <nav>
            <div className="manual-mobile-directory-actions">
              <button
                type="button"
                className="manual-sidebar-action"
                aria-label={t.locateCurrentPage}
                title={t.locateCurrentPage}
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
      <aside className="manual-sidebar" id={sidebarId} ref={sidebarRef}>
        <div className="manual-sidebar-label">
          <div className="manual-sidebar-label-title">
            <Icon name="directory" className="manual-sidebar-label-icon" />
            <span>{t.mobileDirectory}</span>
          </div>
          <div className="manual-sidebar-actions">
            {slug !== undefined ? (
              <button
                type="button"
                className="manual-sidebar-action"
                aria-label={t.locateCurrentPage}
                title={t.locateCurrentPage}
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
          className="manual-sidebar-nav"
          ref={sidebarRef}
          aria-label={t.mobileDirectory}
        >
          {groups.map(group => renderNavigationGroup(group))}
        </nav>
      </aside>
      <DocsSidebarCollapse
        label={sidebarToggleLabel}
        expanded={!isSidebarCollapsed}
        controlsId={sidebarId}
        className="docs-sidebar-collapse-region--manual"
        onToggle={() => setIsSidebarCollapsed(value => !value)}
      />
      <article
        className="manual-article"
        ref={articleRef}
        aria-busy={isPageTransition}
      >
        <div className="manual-article-content docs-reading-content">
          {slug === undefined ? (
            <>
              <h1>{t.manual}</h1>
              <p className="manual-intro">{t.manualIntro}</p>
              {overviewFailed ? (
                <DocumentError
                  title={t.loadError}
                  description={t.loadErrorDescription}
                  heading="h2"
                />
              ) : overviewContent === undefined ? (
                <DocumentLoading label={t.loading} />
              ) : (
                <MarkdownContent
                  resolveLink={resolveLink}
                  resolveImage={resolveImage}
                  messages={t}
                  text={overviewContent.text}
                />
              )}
            </>
          ) : selected === undefined ? (
            <>
              <h1>{t.notFound}</h1>
              <Link to={getPageHref()}>{t.manual}</Link>
            </>
          ) : pageFailed ? (
            <DocumentError
              title={t.loadError}
              description={t.loadErrorDescription}
            />
          ) : displayedContent === undefined ? (
            <DocumentLoading label={t.loading} />
          ) : (
            <>
              {displayedContent.contentLocale !== undefined && displayedContent.contentLocale !== locale && (
                <p role="status">{t.fallbackNotice ?? getCommonMessages(locale, i18n).fallbackNotice}</p>
              )}
              <div lang={displayedContent.contentLocale ?? locale} dir={getLocaleDefinition(displayedContent.contentLocale ?? locale, i18n.localeDefinitions).direction}>
              {displayedContent.format === 'html' ? (
                <>
                  {!/<h1(?:\s|>)/iu.test(displayedContent.text) && (
                    <h1>{displayedPageTitle}</h1>
                  )}
                  <HTMLDocumentContent resolveLink={resolveLink} resolveImage={resolveImage} html={displayedContent.text} messages={t} />
                </>
              ) : (
                <MarkdownContent
                  resolveLink={resolveLink}
                  resolveImage={resolveImage}
                  messages={t}
                  text={displayedContent.text}
                />
              )}
              </div>
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
      <BackToTopButton label={t.top} scrollRef={articleRef} />
      {tocTree.length > 0 && (
        <aside
          className={`manual-toc${isTocOpen ? ' is-open' : ''}${
            isTocHidden ? ' is-hidden' : ''
          }${isTocHoverSuppressed ? ' is-hover-suppressed' : ''}`}
          aria-label={t.contents}
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
                <div className="manual-toc-small-head">
                  {renderTocHeading()}
                </div>
              )}
              {!isTocHidden && (
                <button
                  type="button"
                  className="manual-toc-trigger"
                  aria-label={getTocToggleLabel(isTocOpen, t.contents)}
                  aria-expanded={isTocOpen}
                  aria-controls={tocId}
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
                    {t.contents}
                  </span>
                </button>
              )}
              <div
                className="manual-toc-panel"
                id={tocId}
              >
                {!isTocHidden && renderTocHeading()}
                {renderTocItems(tocTree)}
              </div>
            </>
          )}
        </aside>
      )}
    </main>
  );
}
