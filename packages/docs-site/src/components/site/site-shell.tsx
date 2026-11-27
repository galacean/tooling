import { DocsI18nProvider, useDocsI18n } from '../../providers/i18n';
import { ThemeProvider, useTheme } from '../../providers/theme';
import { PageContext } from '../../providers/page';
import { getCommonMessages } from '../../i18n/messages';
import type { CommonSiteMessages } from '../../i18n/messages';
import { DocumentError } from '../shared/document-error';
import { resolveDocsSiteStorageKeys } from '../../config/resolve';
import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DocsNavigation } from '../../routing/navigation';
import {
  DocsLink,
  DocsNavigationProvider,
  useDocsLocation as useLocation,
  useDocsNavigate as useNavigate,
} from '../../routing/navigation';
import { getLocaleDefinition } from '../../i18n/registry';
import type { DocsI18nOptions } from '../../i18n/messages';
import { formatPageDescription, formatPageTitle } from '../../config/page-metadata';
import { DocumentLoading, Icon, SelectControl } from '../shared';
import type { IconName } from '../shared/icon';
import { DocsPageSwitcher } from './docs-page-switcher';
import type { DocsPageSwitcherItem } from './docs-page-switcher';
import { DocsSearchTrigger } from './docs-search-trigger';
import { LazySearchPanel as SearchPanel } from '../search/lazy-search-panel';
import type { DocsSiteStorageKeys } from '../../preferences';
import type { SearchResult } from '../../search';
import type { SearchPanelMessages } from '../search';

export interface SiteShellMessages extends SearchPanelMessages {
  home: string;
  menu: string;
  searchShort: string;
  switchPage: string;
  theme: string;
  system: string;
  light: string;
  dark: string;
  language: string;
}

export interface SiteShellNavigationItem {
  key: string;
  label: string;
  to: string;
  end?: boolean;
  icon?: IconName;
}

export interface SiteShellProps {
  children?: ReactNode;
  locale: string;
  i18n?: DocsI18nOptions;
  messages?: Partial<CommonSiteMessages>;
  navigation?: DocsNavigation;
  menu: SiteShellNavigationItem[];
  brand: {
    label: string;
    mark: string | { light: string; dark: string };
    docsMark?: { light: string; dark: string };
  };
  storageKeys?: Partial<DocsSiteStorageKeys>;
  githubHref?: string;
  pageKind: 'api' | 'manual' | 'other' | 'not-found';
  pageTitle?: string;
  languages?: {
    options: { value: string; label: string }[];
    href: (locale: string, search: string, hash: string) => string;
  };
  search?: (locale: string) => Promise<SearchResult[]>;
  metadata?: {
    canonical: string;
    alternate: (locale: string) => string;
    description?: string;
    limitContentAlternates?: boolean;
  };
  errorFallback?: (error: unknown) => ReactNode;
  searchErrorFallback?: (error: unknown) => ReactNode;
}

class ShellErrorBoundary extends Component<
  {
    children: ReactNode;
    fallback: (error: unknown) => ReactNode;
    resetKey: string;
  },
  { failed: boolean; error?: unknown; resetKey: string }
> {
  override state: { failed: boolean; error?: unknown; resetKey: string } = {
    failed: false,
    resetKey: '',
  };
  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { failed: boolean; error?: unknown; resetKey: string },
  ) {
    if (props.resetKey !== state.resetKey) {
      return { failed: false, resetKey: props.resetKey };
    }

    return null;
  }

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }

  override render() {
    return this.state.failed ? this.props.fallback(this.state.error) : this.props.children;
  }
}

export function SiteShell(props: SiteShellProps) {
  const keys = resolveDocsSiteStorageKeys(props.storageKeys);
  const inheritedI18n = useDocsI18n();
  const i18n = props.i18n ?? inheritedI18n;

  return (
    <DocsI18nProvider options={i18n}>
      <ThemeProvider layout="site" themeStorageKey={keys.theme} locale={props.locale}>
        <DocsNavigationProvider navigation={props.navigation}>
          <SiteShellContent {...props} i18n={i18n} storageKeys={keys} />
        </DocsNavigationProvider>
      </ThemeProvider>
    </DocsI18nProvider>
  );
}

function SiteShellContent({
  children,
  locale,
  i18n,
  brand,
  menu: navigation,
  languages,
  storageKeys,
  githubHref,
  pageKind,
  pageTitle,
  metadata,
  search: loadSearchItems,
  messages,
  errorFallback: fallback,
  searchErrorFallback: searchFallback,
}: SiteShellProps & { storageKeys: DocsSiteStorageKeys }) {
  const t = { ...getCommonMessages(locale, i18n), ...messages };
  const brandLabel = brand.label;
  const brandMarkURLs =
    typeof brand.mark === 'string' ? { light: brand.mark, dark: brand.mark } : brand.mark;
  const docsBrandMarkURLs = brand.docsMark;
  const locales = languages?.options ?? [];
  const limitContentAlternates = metadata?.limitContentAlternates;
  const pageDescription = metadata?.description;
  const errorFallback =
    fallback ?? (() => <DocumentError title={t.loadError} description={t.loadErrorDescription} />);
  const searchErrorFallback = searchFallback ?? errorFallback;
  const location = useLocation();
  const navigate = useNavigate();
  const pageKey = location.pathname + location.search;
  const [contentLocaleState, setContentLocaleState] = useState<{
    pathname: string;
    locales: string[] | undefined;
  }>();
  const setContentLocales = useCallback(
    (locales: string[] | undefined) => {
      setContentLocaleState(current =>
        current?.pathname === pageKey && JSON.stringify(current.locales) === JSON.stringify(locales)
          ? current
          : { pathname: pageKey, locales },
      );
    },
    [pageKey],
  );
  const alternateLocales =
    contentLocaleState?.pathname === pageKey
      ? contentLocaleState.locales
      : limitContentAlternates === true
        ? []
        : undefined;
  const [search, setSearch] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [documentTitle, setTitle] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const { mode, resolved, change, persist, storageError } = useTheme();
  const brandMarkURL = brandMarkURLs[resolved];
  const docsBrandMarkURL = (docsBrandMarkURLs ?? brandMarkURLs)[resolved];
  const apiPage = pageKind === 'api';
  const manualPage = pageKind === 'manual';
  const documentPage = manualPage || apiPage;
  const activeDocumentTitle = documentPage
    ? documentTitle || (pageTitle ?? '') || t[pageKind]
    : (pageTitle ?? '');
  const themeIcon = mode === 'dark' ? 'moon' : mode === 'light' ? 'sun' : 'system';
  const apiLink = navigation.find(item => item.key === 'api');
  const manualLink = navigation.find(item => item.key === 'manual');
  const searchEnabled = loadSearchItems !== undefined;

  useEffect(() => {
    if (!metadata) {
      return;
    }
    const title = activeDocumentTitle || brandLabel;
    const head = document.head;
    const description =
      head.querySelector<HTMLMetaElement>('meta[name="description"]') ??
      head.appendChild(document.createElement('meta'));
    const canonical =
      head.querySelector<HTMLLinkElement>('link[rel="canonical"]') ??
      head.appendChild(document.createElement('link'));

    document.documentElement.lang = locale;
    document.documentElement.dir = getLocaleDefinition(locale, i18n?.localeDefinitions).direction;
    document.title = formatPageTitle(title, brandLabel);
    description.name = 'description';
    description.content = formatPageDescription(locale, title, pageDescription, i18n);
    canonical.rel = 'canonical';
    canonical.href = metadata.canonical;

    const alternates = new Map(
      locales
        .filter(({ value }) => alternateLocales === undefined || alternateLocales.includes(value))
        .map(({ value }) => [value, metadata.alternate(value)]),
    );

    for (const link of head.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')) {
      const href = alternates.get(link.hreflang);

      if (href === undefined) {
        link.remove();
      } else {
        link.href = href;
        alternates.delete(link.hreflang);
      }
    }
    for (const [language, href] of alternates) {
      const link = document.createElement('link');

      link.rel = 'alternate';
      link.hreflang = language;
      link.href = href;
      head.append(link);
    }
  }, [
    metadata,
    activeDocumentTitle,
    alternateLocales,
    brandLabel,
    pageDescription,
    i18n,
    locale,
    locales,
  ]);
  useEffect(() => {
    setDrawer(false);
    if (!apiPage && location.hash === '') {
      window.scrollTo({ top: 0 });
    }
  }, [apiPage, location.hash, location.pathname]);
  useEffect(() => {
    const dialog = drawerRef.current;

    if (dialog === null) {
      return;
    }
    if (drawer && !dialog.open) {
      dialog.showModal();
    } else if (!drawer && dialog.open) {
      dialog.close();
    }
  }, [drawer]);
  useEffect(() => {
    if (!searchEnabled) {
      return;
    }
    const openSearch = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault();
        setSearch(true);
      }
    };

    window.addEventListener('keydown', openSearch);

    return () => window.removeEventListener('keydown', openSearch);
  }, [searchEnabled]);
  const links = navigation.map(item => (
    <DocsLink key={item.key} to={item.to} end={item.end ?? false}>
      {item.label}
    </DocsLink>
  ));
  const brandHref = navigation.find(item => item.key === 'home')?.to ?? '/';
  const sectionHref = (manualPage ? manualLink : apiLink)?.to ?? brandHref;
  const pageSwitchItems: DocsPageSwitcherItem[] = navigation.map(item => ({
    key: item.key,
    label: item.label,
    href: item.to,
    icon: item.icon ?? (item.key === 'home' ? 'home' : item.key === 'api' ? 'source' : 'book'),
  }));
  const searchButton = (
    <DocsSearchTrigger
      variant="header"
      className={documentPage ? 'docs-mobile-search' : ''}
      ariaLabel={t.search}
      label={t.search}
      onOpen={() => setSearch(true)}
    />
  );
  const searchHistoryKey = `${storageKeys.searchHistory}:${locale}`;
  const preferenceControls = (
    <>
      {languages && (
        <SelectControl
          className="language-select"
          ariaLabel={t.language}
          value={locale}
          options={locales}
          icon={<Icon name="language" />}
          onChange={value => {
            persist(storageKeys.locale, value);
            void navigate(languages.href(value, location.search, location.hash));
          }}
        />
      )}
      <SelectControl
        className="theme-select"
        ariaLabel={t.theme}
        value={mode}
        options={(['system', 'light', 'dark'] as const).map(value => ({
          value,
          label: t[value],
        }))}
        icon={<Icon name={themeIcon} />}
        onChange={value => {
          if (value === 'system' || value === 'light' || value === 'dark') {
            change(value);
          }
        }}
      />
    </>
  );
  const mobileMenuButton = (
    <button
      type="button"
      className="site-mobile-nav-trigger docs-icon-action"
      aria-label={t.menu}
      onClick={() => setDrawer(true)}
    >
      <Icon name="menu" />
    </button>
  );

  return (
    <div
      lang={locale}
      dir={getLocaleDefinition(locale, i18n?.localeDefinitions).direction}
      className={`site-shell${apiPage ? ' api-shell' : ''}${manualPage ? ' manual-shell' : ''}${documentPage && sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}
    >
      {documentPage ? (
        <header className="docs-header-shell">
          <div className="docs-site-header">
            <span className="docs-shell-title">{activeDocumentTitle}</span>
          </div>
          <div className="site-tools docs-header-tools">
            {searchEnabled && searchButton}
            {preferenceControls}
            {mobileMenuButton}
          </div>
        </header>
      ) : (
        pageKind === 'other' && (
          <header className="site-header">
            <DocsLink className="site-brand" to={brandHref}>
              <img className="site-brand-mark" src={brandMarkURL} alt="" aria-hidden="true" />
              {brandLabel}
              <span className="site-brand-dot">.</span>
            </DocsLink>
            <nav className="site-nav">{links}</nav>
            <div className="site-tools">
              {searchEnabled && searchButton}
              {preferenceControls}
              {mobileMenuButton}
            </div>
          </header>
        )
      )}
      {documentPage && (
        <div className="docs-sidebar-head">
          <div className="docs-sidebar-brand">
            <div className="docs-sidebar-crumb">
              <DocsLink className="docs-sidebar-logo" to={brandHref} aria-label={brandLabel}>
                <img className="site-brand-mark" src={docsBrandMarkURL} alt="" aria-hidden="true" />
              </DocsLink>
              <Icon
                name="chevronRight"
                className="docs-sidebar-separator"
                style={{ width: 14, height: 14 }}
              />
              <DocsPageSwitcher
                ariaLabel={t.switchPage}
                currentHref={sectionHref}
                items={pageSwitchItems}
                label={manualPage ? t.manual : t.api}
              />
            </div>
          </div>
          {searchEnabled && (
            <div className="docs-sidebar-search-nav">
              <DocsSearchTrigger
                variant="sidebar"
                ariaLabel={t.searchShort}
                label={t.searchShort}
                onOpen={() => setSearch(true)}
              />
            </div>
          )}
        </div>
      )}
      {storageError && (
        <p role="status" className="site-storage-notice">
          {t.storageError}
        </p>
      )}
      <ShellErrorBoundary resetKey={pageKey} fallback={errorFallback}>
        <Suspense
          fallback={
            pageKind === 'api' || pageKind === 'manual' ? (
              <DocumentLoading layout={pageKind} label={t.loading} />
            ) : (
              <main className="docs-state-page">{t.loading}</main>
            )
          }
        >
          <PageContext
            value={{ locale, messages: t, setTitle, setSidebarCollapsed, setContentLocales }}
          >
            {children}
          </PageContext>
        </Suspense>
      </ShellErrorBoundary>
      {pageKind === 'other' && (
        <footer className="site-footer">
          <DocsLink className="site-brand" to={brandHref}>
            {brandLabel}.
          </DocsLink>
          {githubHref !== undefined && (
            <a href={githubHref} target="_blank" rel="noreferrer">
              <Icon name="github" /> GitHub
            </a>
          )}
        </footer>
      )}
      <dialog
        ref={drawerRef}
        className="docs-drawer site-mobile-drawer"
        aria-label={brandLabel}
        onCancel={event => {
          event.preventDefault();
          setDrawer(false);
        }}
        onClick={event => {
          if (event.target === event.currentTarget) {
            setDrawer(false);
          }
        }}
      >
        <header>
          <strong>{brandLabel}</strong>
          <button
            type="button"
            className="docs-icon-action"
            aria-label={t.close}
            onClick={() => setDrawer(false)}
          >
            <Icon name="close" />
          </button>
        </header>
        <nav className="site-mobile-nav">{links}</nav>
      </dialog>
      {searchEnabled && search && (
        <ShellErrorBoundary resetKey={locale} fallback={searchErrorFallback}>
          <Suspense fallback={null}>
            <SearchPanel
              locale={locale}
              brandLabel={brandLabel}
              brandMarkURL={docsBrandMarkURL}
              historyKey={searchHistoryKey}
              messages={t}
              includeAPI={apiLink !== undefined}
              includeManual={manualLink !== undefined}
              loadItems={loadSearchItems}
              close={() => setSearch(false)}
            />
          </Suspense>
        </ShellErrorBoundary>
      )}
    </div>
  );
}
