// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { SiteShell } from '../../src/components/site/site-shell';
import type { SiteShellMessages } from '../../src/components/site/site-shell';
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

function RoutedSiteShell() {
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
      brandMarkUrls={{ light: '/brand-light.svg', dark: '/brand-dark.svg' }}
      homeHref={`/${locale}`}
      navigation={[{ key: 'manual', label: 'Manual', to: `/${locale}/manual` }]}
      historyKeyPrefix="example:docs:search"
      pageKind="manual"
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
}: { failStorageRead?: boolean } = {}) {
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
      <MemoryRouter initialEntries={['/en/manual?tab=read#intro']}>
        <Routes>
          <Route path="/:locale/manual" element={<RoutedSiteShell />}>
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
  it('switches the brand mark with the resolved theme', async () => {
    renderSite();

    const logo = document.querySelector<HTMLImageElement>('.site-brand .brand-mark');

    expect(logo?.getAttribute('src')).toBe('/brand-light.svg');
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dark' }));

    await waitFor(() =>
      expect(logo?.getAttribute('src')).toBe('/brand-dark.svg'),
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
    fireEvent.click(screen.getByRole('option', { name: '简体中文' }));

    await waitFor(() => {
      expect(screen.getByText('/zh-CN/manual?tab=read#intro')).toBeDefined();
    });
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
});
