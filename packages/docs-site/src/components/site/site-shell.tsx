import { Component, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { DocumentLoading, Icon, SelectControl } from '../shared';
import { LazySearchPanel as SearchPanel } from '../search/lazy-search-panel';
import { useTheme } from '../../providers';
import type { SearchResult } from '../../search';
import type { SearchPanelMessages } from '../search';

export interface SiteShellMessages extends SearchPanelMessages {
  menu: string;
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
}

export interface SiteShellProps {
  locale: string;
  locales: { value: string; label: string }[];
  messages: SiteShellMessages;
  brandLabel: string;
  brandMarkUrls: Readonly<{ light: string; dark: string }>;
  homeHref: string;
  navigation: SiteShellNavigationItem[];
  githubHref?: string;
  historyKeyPrefix: string;
  pageKind: 'api' | 'manual' | 'other';
  pageTitle?: string;
  canonicalHref: string;
  getAlternateHref: (locale: string) => string;
  getLocaleHref: (locale: string, search: string, hash: string) => string;
  loadSearchItems: (locale: string) => Promise<SearchResult[]>;
  errorFallback: (error: unknown) => ReactNode;
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
  brandMarkUrls,
  homeHref,
  navigation,
  githubHref,
  historyKeyPrefix,
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
  const drawerRef = useRef<HTMLDialogElement>(null);
  const { mode, resolved, change, persist, storageError } = useTheme();
  const brandMarkUrl = brandMarkUrls[resolved];
  const apiPage = pageKind === 'api';
  const themeIcon =
    mode === 'dark' ? 'moon' : mode === 'light' ? 'sun' : 'system';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${pageTitle === undefined || pageTitle === '' ? '' : `${pageTitle} | `}${brandLabel}`;
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
  }, [brandLabel, canonicalHref, getAlternateHref, locale, locales, pageTitle]);
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
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearch(true);
      }
    };

    window.addEventListener('keydown', openSearch);

    return () => window.removeEventListener('keydown', openSearch);
  }, []);
  const links = navigation.map(item => (
    <NavLink key={item.key} to={item.to} end={item.end ?? false}>
      {item.label}
    </NavLink>
  ));

  return (
    <div className={`site-shell${apiPage ? ' api-shell' : ''}`}>
      <header className="site-header">
        <Link className="site-brand" to={homeHref}>
          <img
            className="brand-mark"
            src={brandMarkUrl}
            alt=""
            aria-hidden="true"
          />
          {brandLabel}
          <span className="brand-dot">.</span>
        </Link>
        <nav className="site-nav">{links}</nav>
        <div className="site-tools">
          <button
            type="button"
            className="search-trigger icon-action"
            aria-label={t.search}
            onClick={() => setSearch(true)}
          >
            <Icon name="search" />
            <span>{t.search}</span>
            <kbd>{'\u2318 K'}</kbd>
          </button>
          <SelectControl
            className="language-select"
            ariaLabel={t.language}
            value={locale}
            options={locales}
            icon={
              <Icon
                name="language"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            }
            onChange={value => {
              persist('locale', value);
              void navigate(
                getLocaleHref(value, location.search, location.hash),
              );
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
          <button
            type="button"
            className="mobile-nav-trigger icon-action"
            aria-label={t.menu}
            onClick={() => setDrawer(true)}
          >
            <Icon name="menu" />
          </button>
        </div>
      </header>
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
          <Outlet />
        </Suspense>
      </ShellErrorBoundary>
      {pageKind === 'other' && (
        <footer className="site-footer">
          <Link className="site-brand" to={homeHref}>
            {brandLabel}.
          </Link>
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
      {search && (
        <ShellErrorBoundary resetKey={locale} fallback={searchErrorFallback}>
          <Suspense fallback={null}>
            <SearchPanel
              locale={locale}
              brandLabel={brandLabel}
              brandMarkUrl={brandMarkUrl}
              historyKeyPrefix={historyKeyPrefix}
              messages={t}
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
