// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useParams, useOutletContext,
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from '../router';
import type { APIManifest } from '@galacean/docs-site';
import { APISymbolMenu } from '../../src/components/api/api-navigation';
import { APIReferencePage as ControlledAPIReferencePage } from '../../src/components/api/api-reference-page';
import { commonMessages } from '../../src/i18n/messages';

const entry = {
  key: 'root',
  source: 'src/index.ts',
  types: './dist/index.d.ts',
  id: 1,
  symbols: [{ name: 'Example', id: 10, kind: 256 }],
};
const version = {
  version: '1.0.0',
  snapshot: 'a'.repeat(64),
  commit: 'abc123',
  entries: [entry],
  json: { en: 'api/example/1.0.0/en.api.json' },
};
const manifest: APIManifest = {
  schemaVersion: 2,
  defaultVersion: 'current',
  packages: [
    {
      key: 'example',
      name: '@scope/example',
      latestVersion: '1.0.0',
      entries: [entry],
      current: { ...version, version: 'current', packageVersion: '1.0.0' },
      versions: [version],
    },
  ],
};
const messages = {
  ...commonMessages.en,
  api: 'API',
  version: 'Version',
  apiPackage: 'Package',
  showInherited: 'Show inherited',
  loading: 'Loading',
  menu: 'Menu',
  close: 'Close',
  top: 'Top',
  loadError: 'Load failed',
  loadErrorDescription: 'Retry later',
  notFound: 'Not found',
  unknownHash: 'Unknown anchor',
};

function renderPage(
  loadManifest = vi.fn(async () => manifest),
  initialEntry = '/en/api/example',
  pageMessages = messages,
  locale = 'en',
) {
  const loadAPI = vi.fn(async () => ({
    index: { byId: new Map<number, object>([[10, {}]]) },
  }));
  const setAPIDocumentTitle = vi.fn();
  const shellContext = {
    setAPIDocumentTitle,
    setAPISidebarCollapsed: vi.fn(),
  };
  const apiPage = (
    <APIReferencePage
      locale={locale}
      messages={pageMessages}
      loadManifest={loadManifest}
      loadAPI={loadAPI}
      getAPIHref={locale => `/${locale}/api`}
      getPackageHref={(locale, key) => `/${locale}/api/${key}`}
      getSymbolHref={(locale, key, selectedVersion, symbol, entryKey) =>
        `/${locale}/api/${key}/${selectedVersion}/${symbol}?entry=${entryKey}`
      }
      getGroupLabel={() => 'Interfaces'}
      renderKind={() => <span>Interface</span>}
      renderPackageReadme={(key, locale) => (
        <p>
          README:{key}:{locale}
        </p>
      )}
      renderReflection={() => <p>Reflection</p>}
    />
  );

  return {
    loadManifest,
    loadAPI,
    setAPIDocumentTitle,
    ...render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/:locale/api/:pkg"
            element={<Outlet context={shellContext} />}
          >
            <Route index element={apiPage} />
            <Route path=":version/:symbol" element={apiPage} />
          </Route>
        </Routes>
      </MemoryRouter>,
    ),
  };
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

describe('APIReferencePage', () => {
  it.each(['en', 'zh-CN'])('uses configured sidebar labels for %s', async locale => {
    renderPage(vi.fn(async () => manifest), `/${locale}/api/example`, {
      ...messages,
      collapseSidebar: 'Custom collapse sidebar',
      expandSidebar: 'Custom expand sidebar',
    }, locale);

    const collapse = await screen.findByRole('button', { name: 'Custom collapse sidebar' });

    fireEvent.click(collapse);
    expect(screen.getByRole('button', { name: 'Custom expand sidebar' })).toBeDefined();
  });

  it('shows a labeled loading state while the manifest is pending', () => {
    const loadManifest = vi.fn(() => new Promise<APIManifest>(() => {}));

    renderPage(loadManifest);

    expect(screen.getByRole('status').textContent).toBe('Loading');
    expect(document.querySelector('.document-loading-api')).not.toBeNull();
  });

  it('loads the manifest and renders a package landing page without loading a snapshot', async () => {
    const { loadAPI, loadManifest, setAPIDocumentTitle } = renderPage();

    expect(await screen.findByText('README:example:en')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Package' })).toBeNull();
    expect(screen.getByText('@scope/example')).toBeDefined();
    expect(loadAPI).not.toHaveBeenCalled();
    expect(loadManifest).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(setAPIDocumentTitle).toHaveBeenLastCalledWith('@scope/example'),
    );
  });

  it('reports the reflection name for the browser tab', async () => {
    const { setAPIDocumentTitle } = renderPage(
      vi.fn(async () => manifest),
      '/en/api/example/current/Example',
    );

    expect(await screen.findByText('Reflection')).toBeDefined();
    await waitFor(() =>
      expect(setAPIDocumentTitle).toHaveBeenLastCalledWith('Example'),
    );
  });
});

describe('APISymbolMenu', () => {
  it('keeps visited API symbols in browser history', async () => {
    let navigateBack: (() => void | Promise<void>) | undefined;

    function HistoryTestPage() {
      const location = useLocation();
      const navigate = useNavigate();

      navigateBack = () => navigate(-1);

      return (
        <>
          <APISymbolMenu
            symbols={[
              { name: 'First', id: 1, kind: 256 },
              { name: 'Second', id: 2, kind: 256 },
            ]}
            selectedName="First"
            ariaLabel="API symbols"
            getGroupLabel={() => 'Interfaces'}
            getSymbolHref={name => `/api/${name}`}
            renderKind={() => <span>Interface</span>}
            onSelect={vi.fn()}
          />
          <output aria-label="Current location">{location.pathname}</output>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={['/api/First']}>
        <HistoryTestPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: /Second/u }));
    await waitFor(() =>
      expect(screen.getByLabelText('Current location').textContent).toBe(
        '/api/Second',
      ),
    );

    await act(async () => {
      await navigateBack?.();
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Current location').textContent).toBe(
        '/api/First',
      ),
    );
  });
});

function APIReferencePage(props: import('react').ComponentProps<typeof ControlledAPIReferencePage>) {
  const { pkg, version = 'current', symbol } = useParams();
  const query = new URLSearchParams(useLocation().search);
  const shell = useOutletContext<{ setAPIDocumentTitle?: (title: string) => void; setAPISidebarCollapsed?: (collapsed: boolean) => void } | null>();

  return <ControlledAPIReferencePage {...props}
    selection={pkg === undefined ? undefined : { packageKey: pkg, version, symbol, entryKey: query.get('entry') ?? 'root' }}
    onTitleChange={shell?.setAPIDocumentTitle} onSidebarCollapsed={shell?.setAPISidebarCollapsed} />;
}
