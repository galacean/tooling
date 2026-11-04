import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  APINavigationToolbar,
  APISymbolMenu,
  resolveAPIVersionTarget,
} from '../../src/components/api/api-navigation';
import { APIReferenceLayout } from '../../src/components/api/api-reference-layout';
import type {
  APIEntry,
  APIManifestPackage,
  APIVersion,
} from '@galacean/docs-site';

describe('shared APIReferenceLayout', () => {
  it.each([false, true])(
    'composes consumer slots with collapsed=%s',
    collapsed => {
      const renderNavigation = vi.fn((_close: () => void) => (
        <nav>Consumer symbols</nav>
      ));
      const onDrawerChange = vi.fn();
      const markup = renderToStaticMarkup(
        <APIReferenceLayout
          messages={{
            api: 'Reference',
            menu: 'Symbols',
            close: 'Dismiss',
            top: 'Scroll up',
          }}
          sidebarHeading={<strong>Example package</strong>}
          renderNavigation={renderNavigation}
          toolbar={<span>Consumer versions</span>}
          navigationKey="example/symbol"
          scrollRef={{ current: null }}
          collapsed={collapsed}
          onToggleCollapsed={() => undefined}
          drawerOpen={false}
          onDrawerChange={onDrawerChange}
        >
          <article>Consumer reflection</article>
        </APIReferenceLayout>,
      );

      expect(markup).toContain(
        `class="ge-api${collapsed ? ' collapsed' : ''}"`,
      );
      expect(markup).toContain('<strong>Example package</strong>');
      expect(markup).toContain('Consumer versions');
      expect(markup).toContain('<article>Consumer reflection</article>');
      expect(markup).toContain('class="api-scroll"');
      expect(markup).toContain('aria-label="Reference"');
      expect(markup).toContain('aria-label="Dismiss"');
      expect(markup).toContain('aria-label="Scroll up"');
      expect(markup).not.toContain('Design Bridge');
      expect(renderNavigation).toHaveBeenCalledTimes(2);
      expect(renderNavigation).toHaveBeenCalledWith(expect.any(Function));
      for (const [close] of renderNavigation.mock.calls) {
        close();
      }
      expect(onDrawerChange.mock.calls).toEqual([[false], [false]]);
    },
  );
});

const rootEntry: APIEntry = {
  key: 'root',
  source: 'src/index.ts',
  types: 'dist/index.d.ts',
  id: 1,
  symbols: [{ name: 'firstRoot', id: 2, kind: 64 }],
};
const subEntry: APIEntry = {
  ...rootEntry,
  key: 'sub',
  id: 3,
  symbols: [
    { name: 'firstSub', id: 4, kind: 64 },
    { name: 'keep', id: 5, kind: 256 },
  ],
};
const version: APIVersion = {
  version: '1.0.0',
  snapshot: 'fixture',
  commit: 'abc',
  json: {},
  entries: [rootEntry, subEntry],
};
const pkg: APIManifestPackage = {
  key: 'example',
  name: '@example/core',
  latestVersion: '1.0.0',
  entries: version.entries,
  current: { ...version, version: 'current', packageVersion: '1.0.0' },
  versions: [version],
};

describe('shared API navigation', () => {
  it.each([
    [
      'current',
      'sub',
      'keep',
      { version: 'current', entryKey: 'sub', symbolName: 'keep' },
    ],
    [
      '1.0.0',
      'sub',
      'keep',
      { version: '1.0.0', entryKey: 'sub', symbolName: 'keep' },
    ],
    [
      '1.0.0',
      'missing',
      'keep',
      { version: '1.0.0', entryKey: 'root', symbolName: 'firstRoot' },
    ],
    [
      '1.0.0',
      'sub',
      'missing',
      { version: '1.0.0', entryKey: 'sub', symbolName: 'firstSub' },
    ],
    [
      '1.0.0',
      'sub',
      undefined,
      { version: '1.0.0', entryKey: 'sub', symbolName: 'firstSub' },
    ],
    ['9.0.0', 'root', 'firstRoot', undefined],
  ] as const)(
    'selects version %s, entry %s, symbol %s',
    (selectedVersion, entry, symbol, expected) => {
      expect(
        resolveAPIVersionTarget(pkg, selectedVersion, entry, symbol),
      ).toEqual(expected);
    },
  );

  it('does not navigate when the selected version has no entry or symbol', () => {
    const empty = { ...pkg, versions: [{ ...version, entries: [] }] };
    const noSymbols = {
      ...pkg,
      versions: [{ ...version, entries: [{ ...rootEntry, symbols: [] }] }],
    };

    expect(
      resolveAPIVersionTarget(empty, '1.0.0', 'root', 'firstRoot'),
    ).toBeUndefined();
    expect(
      resolveAPIVersionTarget(noSymbols, '1.0.0', 'root', 'firstRoot'),
    ).toBeUndefined();
  });

  it('groups symbols in first-appearance order and uses consumer links and kind labels', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <APISymbolMenu
          symbols={[
            { name: 'run', id: 1, kind: 64 },
            { name: 'Options', id: 2, kind: 256 },
            { name: 'stop', id: 3, kind: 64 },
          ]}
          selectedName="stop"
          ariaLabel="Example reference"
          getGroupLabel={kind => (kind === 64 ? 'Commands' : 'Models')}
          getSymbolHref={name => `/fr/reference/${name}/`}
          renderKind={kind => <span data-kind={kind}>Badge</span>}
          onSelect={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(markup.match(/class="api-menu-group"/gu)).toHaveLength(2);
    expect(markup.indexOf('>stop</span>')).toBeLessThan(
      markup.indexOf('>Options</span>'),
    );
    expect(markup).toContain('href="/fr/reference/stop/"');
    expect(markup).toContain(
      'class="api-menu-item selected" aria-current="page"',
    );
    expect(markup).toContain('aria-label="Example reference"');
    expect(markup).toContain('data-kind="256"');
  });

  it.each([false, true])('renders toolbar with packageHome=%s', packageHome => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <APINavigationToolbar
          pkg={pkg}
          packages={[pkg]}
          version="current"
          entryKey="sub"
          symbol={{ name: 'keep', kind: 256 }}
          packageHome={packageHome}
          showInherited={true}
          onShowInheritedChange={() => undefined}
          messages={{
            api: 'Reference',
            version: 'Release',
            apiPackage: 'Library',
            showInherited: 'Inherited members',
          }}
          apiHref="/fr/reference/"
          getPackageHref={key => `/fr/reference/${key}/`}
          getSymbolHref={target =>
            `/fr/reference/${target.version}/${target.symbolName}/`
          }
          renderKind={kind => <span data-kind={kind}>Badge</span>}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('href="/fr/reference/"');
    expect(markup).toContain('aria-label="Library"');
    if (packageHome) {
      expect(markup).not.toContain('api-version-select');
      expect(markup).not.toContain('api-inherited-toggle');
      expect(markup).not.toContain('api-current-symbol');
    } else {
      expect(markup).toContain('current (1.0.0)');
      expect(markup).toContain('aria-label="Release"');
      expect(markup).toContain('aria-label="Inherited members" checked=""');
      expect(markup).toContain('api-current-symbol');
    }
  });
});
