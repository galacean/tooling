// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { APIManifest } from '@galacean/docs-site';
import { APIReferencePage } from '../../src/components/api/api-reference-page';

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

function renderPage(loadManifest = vi.fn(async () => manifest)) {
  const loadAPI = vi.fn(async () => ({ index: { byId: new Map() } }));

  return {
    loadManifest,
    loadAPI,
    ...render(
      <MemoryRouter initialEntries={['/en/api/example']}>
        <Routes>
          <Route
            path="/:locale/api/:pkg"
            element={
              <APIReferencePage
                locale="en"
                messages={messages}
                loadManifest={loadManifest}
                loadAPI={loadAPI}
                getAPIHref={locale => `/${locale}/api`}
                getPackageHref={(locale, key) => `/${locale}/api/${key}`}
                getSymbolHref={(
                  locale,
                  key,
                  selectedVersion,
                  symbol,
                  entryKey,
                ) =>
                  `/${locale}/api/${key}/${selectedVersion}/${symbol}?entry=${entryKey}`
                }
                getGroupLabel={() => 'Interfaces'}
                renderKind={() => <span>Interface</span>}
                symbolCountLabel={count => `${count} symbols`}
                renderPackageReadme={(key, _keys, locale) => (
                  <p>
                    README:{key}:{locale}
                  </p>
                )}
                renderReflection={() => <p>Reflection</p>}
              />
            }
          />
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

describe('APIReferencePage', () => {
  it('shows a labeled loading state while the manifest is pending', () => {
    const loadManifest = vi.fn(() => new Promise<APIManifest>(() => {}));

    renderPage(loadManifest);

    expect(screen.getByRole('status').textContent).toBe('Loading');
    expect(document.querySelector('.document-loading-api')).not.toBeNull();
  });

  it('loads the manifest and renders a package landing page without loading a snapshot', async () => {
    const { loadAPI, loadManifest } = renderPage();

    expect(await screen.findByText('README:example:en')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Package' })).toBeDefined();
    expect(screen.getByText('@scope/example')).toBeDefined();
    expect(loadAPI).not.toHaveBeenCalled();
    expect(loadManifest).toHaveBeenCalledOnce();
  });
});
