import { Component, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { DocumentLoading, Icon, SelectControl } from '../shared';
import type { IconName } from '../shared/icon';
import { DocsPageSwitcher } from './docs-page-switcher';
import { SiteLink } from './site-link';
import type { DocsPageSwitcherItem } from './docs-page-switcher';
import { DocsSearchTrigger } from './docs-search-trigger';
import { LazySearchPanel as SearchPanel } from '../search/lazy-search-panel';
import { useTheme } from '../../providers';
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
  locale: string;
  locales: { value: string; label: string }[];
  storageKeys: DocsSiteStorageKeys;
  messages: SiteShellMessages;
  brandLabel: string;
  brandMarkURLs: Readonly<{ light: string; dark: string }>;
  docsBrandMarkURLs?: Readonly<{ light: string; dark: string }>;
  homeHref: string;
  navigation: SiteShellNavigationItem[];
  githubHref?: string;
  pageKind: 'api' | 'manual' | 'other' | 'not-found';
  pageTitle?: string;
  canonicalHref: string;
  getAlternateHref: (locale: string) => string;
  getLocaleHref: (locale: string, search: string, hash: string) => string;
  loadSearchItems: (locale: string) => Promise<SearchResult[]>;
  errorFallback: (error: unknown) => ReactNode;
  searchErrorFallback?: (error: unknown) => ReactNode;
}

export interface SiteShellOutletContext {
  setManualPageTitle: (title: string) => void;
  setManualSidebarCollapsed: (collapsed: boolean) => void;
  setAPIDocumentTitle: (title: string) => void;
  setAPISidebarCollapsed: (collapsed: boolean) => void;
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
    return this.state.failed
      ? this.props.fallback(this.state.error)
      : this.props.children;
  }
}

export function SiteShell({
  locale,
  locales,
  messages: t,
  brandLabel,
  brandMarkURLs,
  docsBrandMarkURLs,
  homeHref,
  storageKeys,
  navigation,
  githubHref,
  pageKind,
  pageTitle,
  canonicalHref,
  getAlternateHref,
  getLocaleHref,
  loadSearchItems,
  errorFallback,
  searchErrorFallback = errorFallback,
}: SiteShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [manualPageTitle, setManualPageTitle] = useState('');
  const [manualSidebarCollapsed, setManualSidebarCollapsed] = useState(false);
  const [apiDocumentTitle, setAPIDocumentTitle] = useState('');
  const [apiSidebarCollapsed, setAPISidebarCollapsed] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const { mode, resolved, change, persist, storageError } = useTheme();
  const brandMarkURL = brandMarkURLs[resolved];
  const docsBrandMarkURL = (docsBrandMarkURLs ?? brandMarkURLs)[resolved];
  const apiPage = pageKind === 'api';
  const manualPage = pageKind === 'manual';
  const documentPage = manualPage || apiPage;
  const activeDocumentTitle = manualPage
    ? manualPageTitle !== ''
      ? manualPageTitle
      : t.manual
    : apiPage
      ? apiDocumentTitle !== ''
        ? apiDocumentTitle
        : pageTitle !== undefined && pageTitle !== ''
          ? pageTitle
          : t.api
      : (pageTitle ?? '');
  const themeIcon =
    mode === 'dark' ? 'moon' : mode === 'light' ? 'sun' : 'system';
  const apiLink = navigation.find(item => item.key === 'api');
  const manualLink = navigation.find(item => item.key === 'manual');
  const searchEnabled = apiLink !== undefined || manualLink !== undefined;

  useEffect(() => {
    if (!manualPage) {
      setManualPageTitle('');
      setManualSidebarCollapsed(false);
    }
  }, [manualPage]);
  useEffect(() => {
    if (!apiPage) {
      setAPISidebarCollapsed(false);
      setAPIDocumentTitle('');
    }
  }, [apiPage]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = documentPage
      ? activeDocumentTitle
      : `${activeDocumentTitle === '' ? '' : `${activeDocumentTitle} | `}${brandLabel}`;
    const head = document.head;
    const canonical =
      head.querySelector<HTMLLinkElement>('link[rel="canonical"]') ??
      document.createElement('link');

    canonical.rel = 'canonical';
    canonical.href = canonicalHref;
    head.append(canonical);
    for (const language of locales) {
      const alternate =
        Array.from(
          head.querySelectorAll<HTMLLinkElement>(
            'link[rel="alternate"][hreflang]',
          ),
        ).find(link => link.hreflang === language.value) ??
        document.createElement('link');

      alternate.rel = 'alternate';
      alternate.hreflang = language.value;
      alternate.href = getAlternateHref(language.value);
      head.append(alternate);
    }
  }, [
    activeDocumentTitle,
    brandLabel,
    canonicalHref,
    documentPage,
    getAlternateHref,
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
    <SiteLink key={item.key} to={item.to} end={item.end ?? false}>
      {item.label}
    </SiteLink>
  ));
  const sectionHref = (manualPage ? manualLink : apiLink)?.to ?? homeHref;
  const pageSwitchItems: DocsPageSwitcherItem[] = [
    { key: 'home', label: t.home, href: homeHref, icon: 'home' },
    ...(manualLink !== undefined
      ? [{ key: 'manual', label: t.manual, href: manualLink.to, icon: 'book' as const }]
      : []),
    ...(apiLink !== undefined
      ? [{ key: 'api', label: t.api, href: apiLink.to, icon: 'source' as const }]
      : []),
    ...navigation
      .filter(item => !['home', 'manual', 'api'].includes(item.key))
      .map(item => ({
        key: item.key,
        label: item.label,
        href: item.to,
        icon: item.icon ?? 'book',
      })),
  ];
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
      <SelectControl
        className="language-select"
        ariaLabel={t.language}
        value={locale}
        options={locales}
        icon={<Icon name="language" />}
        onChange={value => {
          persist(storageKeys.locale, value);
          void navigate(getLocaleHref(value, location.search, location.hash));
        }}
      />
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
      className="mobile-nav-trigger icon-action"
      aria-label={t.menu}
      onClick={() => setDrawer(true)}
    >
      <Icon name="menu" />
    </button>
  );

  return (
    <div
      className={`site-shell${apiPage ? ' api-shell' : ''}${apiPage && apiSidebarCollapsed ? ' api-sidebar-collapsed' : ''}${manualPage ? ' manual-shell' : ''}${manualPage && manualSidebarCollapsed ? ' manual-sidebar-collapsed' : ''}`}
    >
      {documentPage ? (
        <header className="docs-header-shell">
          <div className="docs-site-header">
            <span className="docs-shell-title">
              {manualPage
                ? manualPageTitle !== ''
                  ? manualPageTitle
                  : t.manual
                : pageTitle !== undefined && pageTitle !== ''
                  ? pageTitle
                  : t.api}
            </span>
          </div>
          <div className="site-tools docs-header-tools">
            {searchEnabled && searchButton}
            {preferenceControls}
            {mobileMenuButton}
          </div>
        </header>
      ) : pageKind === 'other' && (
        <header className="site-header">
          <SiteLink className="site-brand" to={homeHref}>
            <img
              className="brand-mark"
              src={brandMarkURL}
              alt=""
              aria-hidden="true"
            />
            {brandLabel}
            <span className="brand-dot">.</span>
          </SiteLink>
          <nav className="site-nav">{links}</nav>
          <div className="site-tools">
            {searchEnabled && searchButton}
            {preferenceControls}
            {mobileMenuButton}
          </div>
        </header>
      )}
      {documentPage && (
        <div className="docs-sidebar-head">
          <div className="docs-sidebar-brand">
            <div className="docs-sidebar-crumb">
              <SiteLink
                className="docs-sidebar-logo"
                to={homeHref}
                aria-label={brandLabel}
              >
                <img
                  className="brand-mark"
                  src={docsBrandMarkURL}
                  alt=""
                  aria-hidden="true"
                />
              </SiteLink>
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
        <p role="status" className="storage-notice">
          {t.storageError}
        </p>
      )}
      <ShellErrorBoundary resetKey={location.pathname} fallback={errorFallback}>
        <Suspense
          fallback={
            pageKind === 'api' || pageKind === 'manual' ? (
              <DocumentLoading layout={pageKind} label={t.loading} />
            ) : (
              <main className="state-page">{t.loading}</main>
            )
          }
        >
          <Outlet
            context={{
              setManualPageTitle,
              setManualSidebarCollapsed,
              setAPIDocumentTitle,
              setAPISidebarCollapsed,
            }}
          />
        </Suspense>
      </ShellErrorBoundary>
      {pageKind === 'other' && (
        <footer className="site-footer">
          <SiteLink className="site-brand" to={homeHref}>
            {brandLabel}.
          </SiteLink>
          {githubHref !== undefined && (
            <a href={githubHref} target="_blank" rel="noreferrer">
              <Icon name="github" /> GitHub
            </a>
          )}
        </footer>
      )}
      <dialog
        ref={drawerRef}
        className="site-mobile-drawer"
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
            className="icon-action"
            aria-label={t.close}
            onClick={() => setDrawer(false)}
          >
            <Icon name="close" />
          </button>
        </header>
        <nav className="mobile-nav">{links}</nav>
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
              navigate={url => {
                void navigate(url);
              }}
              close={() => setSearch(false)}
            />
          </Suspense>
        </ShellErrorBoundary>
      )}
    </div>
  );
}
