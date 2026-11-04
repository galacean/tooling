import { describe, expect, it } from 'vitest';
import {
  getAPISymbolRouteSegment,
  parseAPIManifest,
} from '@galacean/docs-site';

const manifest = {
  schemaVersion: 2,
  defaultVersion: 'current',
  packages: (() => {
    const entries = [
      {
        key: 'root',
        source: 'src/index.ts',
        types: './dist/index.d.ts',
        id: 1,
        symbols: [{ name: 'Widget', id: 2, kind: 256 }],
      },
    ];

    return [
      {
        key: 'widget',
        name: '@example/widget',
        latestVersion: '1.2.3',
        entries,
        current: {
          version: 'current',
          packageVersion: '1.2.3',
          snapshot: 'a'.repeat(64),
          commit: 'abc123',
          entries,
          json: { en: 'api/1.2.3/en.api.json' },
        },
        versions: [
          {
            version: '1.2.3',
            snapshot: 'a'.repeat(64),
            commit: 'abc123',
            entries,
            json: { en: 'api/1.2.3/en.api.json' },
          },
        ],
      },
    ];
  })(),
};

describe('parseAPIManifest', () => {
  it('accepts a valid manifest without changing it', () => {
    expect(parseAPIManifest(manifest)).toBe(manifest);
  });

  it('rejects duplicate package keys and malformed symbols', () => {
    expect(() =>
      parseAPIManifest({
        ...manifest,
        packages: [...manifest.packages, manifest.packages[0]],
      }),
    ).toThrow('Invalid API manifest');
    const invalid = structuredClone(manifest);

    invalid.packages = invalid.packages.map(pkg => ({
      ...pkg,
      entries: pkg.entries.map(entry => ({
        ...entry,
        symbols: entry.symbols.map(symbol => ({ ...symbol, id: 1.5 })),
      })),
    }));
    expect(() => parseAPIManifest(invalid)).toThrow('Invalid API manifest');
  });

  it('rejects unsafe data paths and inconsistent current versions', () => {
    const unsafePath = structuredClone(manifest);

    unsafePath.packages = unsafePath.packages.map(pkg => ({
      ...pkg,
      current: {
        ...pkg.current,
        json: { ...pkg.current.json, en: '../outside.json' },
      },
    }));
    expect(() => parseAPIManifest(unsafePath)).toThrow('Invalid API manifest');

    const inconsistent = structuredClone(manifest);

    inconsistent.packages = inconsistent.packages.map(pkg => ({
      ...pkg,
      current: { ...pkg.current, packageVersion: '1.2.2' },
    }));
    expect(() => parseAPIManifest(inconsistent)).toThrow(
      'Invalid API manifest',
    );
  });

  it('rejects a current alias that disagrees with the latest archived snapshot', () => {
    const inconsistent = structuredClone(manifest);

    inconsistent.packages = inconsistent.packages.map(pkg => ({
      ...pkg,
      current: { ...pkg.current, snapshot: 'b'.repeat(64) },
    }));
    expect(() => parseAPIManifest(inconsistent)).toThrow(
      'Invalid API manifest',
    );
  });
});

describe('getAPISymbolRouteSegment', () => {
  it('keeps ordinary symbol routes unchanged', () => {
    const symbols = [{ name: 'Widget' }, { name: 'WidgetOptions' }];

    expect(getAPISymbolRouteSegment(symbols, 'Widget')).toBe('Widget');
  });

  it('adds distinct stable segments for names that differ only by case', () => {
    const symbols = [{ name: 'MaskConfig' }, { name: 'maskConfig' }];
    const upper = getAPISymbolRouteSegment(symbols, 'MaskConfig');
    const lower = getAPISymbolRouteSegment(symbols, 'maskConfig');

    expect(upper).not.toBe(lower);
    expect(upper.toLowerCase()).not.toBe(lower.toLowerCase());
    expect(upper).toBe(getAPISymbolRouteSegment(symbols, 'MaskConfig'));
  });
});
