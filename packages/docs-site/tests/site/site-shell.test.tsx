// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router-dom';
import { SiteShell } from '../../src/components/site/site-shell';
import type {
  SiteShellMessages,
  SiteShellOutletContext,
} from '../../src/components/site/site-shell';
import { ThemeProvider } from '../../src/providers/theme';

const messages: SiteShellMessages = {
  search: 'Search',
  close: 'Close',
  searchPlaceholder: 'Search docs',
  storageError: 'Storage error',
  loading: 'Loading',
  loadError: 'Unable to load',
  retry: 'Retry',
  history: 'Recent searches',
  clear: 'Clear',
  searchHistoryEmpty: 'No recent searches',
  noResults: 'No results',
  delete: 'Delete',
  original: 'Original',
  api: 'API',
  manual: 'Manual',
  menu: 'Menu',
  theme: 'Theme',
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  language: 'Language',
};

function CurrentLocation() {
  const location = useLocation();

  return (
    <output>{`${location.pathname}${location.search}${location.hash}`}</output>
  );
}

function RoutedManualPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { setManualPageTitle, setManualSidebarCollapsed } =
    useOutletContext<SiteShellOutletContext>();

  useEffect(() => {
    setManualPageTitle(slug ?? 'Manual');
  }, [setManualPageTitle, slug]);

  return (
    <aside className="manual-sidebar">
      <button type="button" onClick={() => setManualSidebarCollapsed(true)}>
        Collapse directory
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate(`/en/manual/${slug === 'first' ? 'second' : 'first'}`);
        }}
      >
        Next page
      </button>
      <span>{slug}</span>
    </aside>
  );
}

function RoutedSiteShell({
  pageKind = 'manual',
}: { pageKind?: 'manual' | 'api' | 'other' } = {}) {
  const { locale = 'en' } = useParams();
  const locales = [
    { value: 'en', label: 'English' },
    { value: 'zh-CN', label: '简体中文' },
  ];

  return (
    <SiteShell
      locale={locale}
      locales={locales}
      messages={messages}
      brandLabel="Example Docs"
      brandMarkUrls={{
        light: '/artis-logo.svg',
        dark: '/artis-logo-dark.svg',
      }}
      docsBrandMarkUrls={{
        light: '/brand/artis-mark-light.svg',
        dark: '/brand/artis-mark-dark.svg',
      }}
      homeHref={`/${locale}`}
      navigation={[
        { key: 'manual', label: 'Manual', to: `/${locale}/manual` },
        { key: 'api', label: 'API', to: `/${locale}/api` },
      ]}
      historyKeyPrefix="example:docs:search"
      pageKind={pageKind}
      canonicalHref={`https://example.test/${locale}/manual`}
      getAlternateHref={language => `https://example.test/${language}/manual`}
      getLocaleHref={(language, search, hash) =>
        `/${language}/manual${search}${hash}`
      }
      loadSearchItems={async () => []}
      errorFallback={() => <p>Unable to load</p>}
    />
  );
}

function renderSite({
  failStorageRead = false,
  initialEntry = '/en/manual?tab=read#intro',
}: { failStorageRead?: boolean; initialEntry?: string } = {}) {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => {
      if (failStorageRead) {
        throw new Error('Storage blocked');
      }

      return values.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
  const media = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  vi.stubGlobal('scrollTo', vi.fn());

  render(
    <ThemeProvider namespace="example:docs">
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/:locale"
            element={<RoutedSiteShell pageKind="other" />}
          />
          <Route path="/:locale/manual" element={<RoutedSiteShell />}>
            <Route index element={<CurrentLocation />} />
            <Route path=":slug" element={<RoutedManualPage />} />
          </Route>
          <Route
            path="/:locale/api"
            element={<RoutedSiteShell pageKind="api" />}
          >
            <Route index element={<CurrentLocation />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );

  return { storage, values };
}

let showModal: ReturnType<typeof vi.fn>;
let closeDialog: ReturnType<typeof vi.fn>;
let originalShowModal: PropertyDescriptor | undefined;
let originalCloseDialog: PropertyDescriptor | undefined;

beforeEach(() => {
  originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );
  originalCloseDialog = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'close',
  );
  showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  closeDialog = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: showModal,
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: closeDialog,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalShowModal === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  } else {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'showModal',
      originalShowModal,
    );
  }
  if (originalCloseDialog === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  } else {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'close',
      originalCloseDialog,
    );
  }
});

describe('SiteShell preferences', () => {
  it('renders the shared left brand and responsive search for API pages', async () => {
    renderSite({ initialEntry: '/en/api' });

    expect(await screen.findByText('/en/api')).toBeDefined();
    const sidebarHead = document.querySelector('.api-shell .docs-sidebar-head');

    expect(sidebarHead).not.toBeNull();
    expect(
      sidebarHead?.querySelector('.docs-page-switcher-current')?.textContent,
    ).toBe('API');
    expect(
      sidebarHead
        ?.querySelector('.docs-page-switcher-current')
        ?.getAttribute('href'),
    ).toBe('/en/api');
    expect(
      sidebarHead?.querySelector('.docs-sidebar-search-trigger'),
    ).not.toBeNull();
    const sidebarSearchShortcut =
      sidebarHead?.querySelector('kbd')?.textContent;
    const headerSearch = document.querySelector(
      '.api-shell .docs-header-tools .docs-mobile-search',
    );
    const expectedShortcut = /Mac|iPhone|iPad|iPod/u.test(navigator.platform)
      ? '⌘ K'
      : 'Ctrl K';

    expect(sidebarSearchShortcut).toBe(expectedShortcut);
    expect(headerSearch?.querySelector('kbd')?.textContent).toBe(
      sidebarSearchShortcut,
    );
    expect(
      document.querySelector('.api-shell .docs-site-header .search-trigger'),
    ).toBeNull();
  });

  it('switches document sections from the sidebar crumb menu', async () => {
    renderSite({ initialEntry: '/en/manual/first' });

    const switcher = screen.getByRole('button', { name: 'Switch page' });

    fireEvent.click(switcher);

    const menu = screen.getByRole('menu', { name: 'Switch page' });

    expect(menu.classList.contains('docs-dropdown-menu')).toBe(true);
    expect(within(menu).getByRole('menuitem', { name: 'Home' })).not.toBeNull();
    expect(
      within(menu).getByRole('menuitem', { name: 'Manual' }),
    ).not.toBeNull();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'API' }));

    await waitFor(() => {
      expect(screen.getByText('/en/api')).toBeDefined();
    });
  });

  it('navigates from the crumb label without opening the page menu', async () => {
    renderSite({ initialEntry: '/en/manual/first' });

    fireEvent.click(screen.getByRole('link', { name: 'Manual' }));

    await waitFor(() => {
      expect(screen.getByText('/en/manual')).toBeDefined();
    });
    expect(screen.queryByRole('menu', { name: 'Switch page' })).toBeNull();
  });

  it('closes the sidebar page menu on Escape and outside pointer', () => {
    renderSite({ initialEntry: '/en/manual/first' });
    const trigger = screen.getByRole('button', { name: 'Switch page' });

    fireEvent.click(trigger);
    expect(screen.getByRole('menu', { name: 'Switch page' })).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu', { name: 'Switch page' })).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('menu', { name: 'Switch page' })).toBeNull();
  });

  it('tracks the collapsed manual sidebar state on the shell', async () => {
    renderSite({ initialEntry: '/en/manual/first' });
    const shell = document.querySelector('.site-shell');

    expect(shell?.classList.contains('manual-sidebar-collapsed')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse directory' }));

    await waitFor(() =>
      expect(shell?.classList.contains('manual-sidebar-collapsed')).toBe(true),
    );
  });

  it('renders the current manual title in the document header', async () => {
    renderSite({ initialEntry: '/en/manual/first' });

    expect(
      await screen.findByText('first', { selector: '.docs-shell-title' }),
    ).toBeDefined();
    expect(document.querySelector('.docs-site-header')).not.toBeNull();
    expect(document.querySelector('.manual-shell .site-header')).toBeNull();
    expect(document.querySelector('.manual-reader-title')).toBeNull();
  });

  it('switches the brand mark with the resolved theme', async () => {
    renderSite();

    const logo = document.querySelector<HTMLImageElement>(
      '.docs-sidebar-logo .brand-mark',
    );

    expect(logo?.getAttribute('src')).toBe('/brand/artis-mark-light.svg');
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dark' }));

    await waitFor(() =>
      expect(logo?.getAttribute('src')).toBe('/brand/artis-mark-dark.svg'),
    );

    fireEvent.click(document.querySelector('.docs-sidebar-search-nav button')!);

    await waitFor(() =>
      expect(
        document
          .querySelector<HTMLImageElement>('.site-search-heading > img')
          ?.getAttribute('src'),
      ).toBe('/brand/artis-mark-dark.svg'),
    );
  });

  it('keeps the original product logo on the home site brand', async () => {
    renderSite({ initialEntry: '/en' });

    const logo = document.querySelector<HTMLImageElement>(
      '.site-brand .brand-mark',
    );

    expect(logo?.getAttribute('src')).toBe('/artis-logo.svg');
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dark' }));

    await waitFor(() =>
      expect(logo?.getAttribute('src')).toBe('/artis-logo-dark.svg'),
    );
  });

  it('shows a visible notice when preference storage is blocked', () => {
    renderSite({ failStorageRead: true });

    expect(
      screen.getByText('Storage error', { selector: '.storage-notice' })
        .textContent,
    ).toBe('Storage error');
    expect(document.querySelector('.site-footer')).toBeNull();
  });

  it('preserves query and hash when switching language', async () => {
    const { storage } = renderSite();

    fireEvent.click(screen.getByRole('button', { name: 'Language' }));
    expect(
      screen
        .getByRole('listbox', { name: 'Language' })
        .classList.contains('docs-dropdown-menu'),
    ).toBe(true);
    expect(
      document.querySelector('.language-select')?.classList.contains('is-open'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('option', { name: '简体中文' }));

    await waitFor(() => {
      expect(screen.getByText('/zh-CN/manual?tab=read#intro')).toBeDefined();
    });
    expect(
      document.querySelector('.language-select')?.classList.contains('is-open'),
    ).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith(
      'example:docs:locale',
      'zh-CN',
    );
  });

  it('persists theme selection in the consumer namespace', async () => {
    const { values } = renderSite();

    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dark' }));

    await waitFor(() =>
      expect(document.documentElement.dataset['theme']).toBe('dark'),
    );
    expect(values.get('example:docs:theme')).toBe('dark');
  });

  it('preserves the manual sidebar DOM and scroll position across navigation', async () => {
    renderSite({ initialEntry: '/en/manual/first' });
    const sidebar = document.querySelector<HTMLElement>('.manual-sidebar');

    expect(sidebar).not.toBeNull();
    Object.defineProperty(sidebar, 'scrollTop', {
      configurable: true,
      value: 120,
      writable: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() =>
      expect(
        screen.getByText('second', { selector: '.manual-sidebar span' }),
      ).toBeDefined(),
    );
    expect(document.querySelector('.manual-sidebar')).toBe(sidebar);
    expect(sidebar?.scrollTop).toBe(120);
  });

  it('opens search with the keyboard shortcut and closes from the panel', async () => {
    renderSite();

    fireEvent.keyDown(window, { key: 'K', ctrlKey: true });

    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeDefined();
    expect(showModal).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull(),
    );
  });

  it('shows the platform shortcut consistently for narrow and sidebar search', async () => {
    renderSite({ initialEntry: '/en/manual/first' });

    const expectedShortcut = /Mac|iPhone|iPad|iPod/u.test(navigator.platform)
      ? '⌘ K'
      : 'Ctrl K';

    expect(
      document.querySelector('.docs-sidebar-search-trigger kbd')?.textContent,
    ).toBe(expectedShortcut);
    expect(
      document.querySelector('.docs-header-tools .docs-mobile-search kbd')
        ?.textContent,
    ).toBe(expectedShortcut);
    expect(
      document.querySelector('.docs-site-header .search-trigger'),
    ).toBeNull();
    fireEvent.keyDown(window, { key: 'j', metaKey: true });

    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull(),
    );
  });

  it('shows Command-K on Apple platforms', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(
      navigator,
      'platform',
    );

    try {
      Object.defineProperty(navigator, 'platform', {
        configurable: true,
        value: 'MacIntel',
      });
      renderSite({ initialEntry: '/en/manual/first' });

      expect(
        document.querySelector('.docs-sidebar-search-trigger kbd')?.textContent,
      ).toBe('⌘ K');
      expect(
        document.querySelector('.docs-header-tools .docs-mobile-search kbd')
          ?.textContent,
      ).toBe('⌘ K');
    } finally {
      if (originalPlatform === undefined) {
        Reflect.deleteProperty(navigator, 'platform');
      } else {
        Object.defineProperty(navigator, 'platform', originalPlatform);
      }
    }
  });
});
