import { describe, expect, it, vi } from 'vitest';
import { createAPISource } from '@galacean/docs-site';

const snapshot = 'a'.repeat(64);
const entry = {
  key: 'root',
  source: 'src/index.ts',
  types: './dist/index.d.ts',
  id: 1,
  symbols: [],
};
const project = {
  id: 1,
  name: 'fixture',
  kind: 1,
  variant: 'project',
  schemaVersion: '2.0',
  flags: {},
  symbolIdMap: {},
  files: { entries: {}, reflections: {} },
  apiSnapshot: { commit: 'fixture', packages: [] },
  locale: 'en',
};
const info = {
  snapshot,
  commit: 'fixture',
  entries: [entry],
  json: {
    en: 'api/example/1.0.0/en.api.json',
    'zh-CN': 'api/example/1.0.0/zh-CN.api.json',
  },
};
const manifest = {
  schemaVersion: 2,
  defaultVersion: 'current',
  packages: [
    {
      key: 'example',
      name: '@example/package',
      latestVersion: '1.0.0',
      entries: [entry],
      current: { ...info, version: 'current', packageVersion: '1.0.0' },
      versions: [{ ...info, version: '1.0.0' }],
    },
  ],
};

describe('API source', () => {
  it('shares snapshot downloads and caches preview and release indexes separately', async () => {
    const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      return Response.json(
        url.endsWith('manifest.json')
          ? manifest
          : url.includes('/snapshots/')
            ? project
            : { $ref: 'api/snapshots/sha256/en.api.json' },
      );
    });
    const client = createAPISource({
      baseURL: '/site/',
      locales: ['en', 'zh-CN'],
      fetcher,
    });
    const [first, second] = await Promise.all([
      client.loadAPI('example', 'current', 'en'),
      client.loadAPI('example', '1.0.0', 'en'),
    ]);

    expect(first.project).toEqual(project);
    expect(second.project).toEqual(project);
    expect(second.index).not.toBe(first.index);
    expect(await client.loadAPI('example', 'current', 'en')).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenNthCalledWith(1, '/site/data/api/manifest.json');
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/site/data/api/example/1.0.0/en.api.json',
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      '/site/data/api/snapshots/sha256/en.api.json',
    );
  });

  it('drops failed manifest and snapshot promises so later requests can retry', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json({ $ref: 'api/snapshots/sha256/en.api.json' }))
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(Response.json(project));
    const client = createAPISource({
      baseURL: '/',
      locales: ['en'],
      fetcher,
    });

    await expect(client.loadAPI('example', 'current', 'en')).rejects.toThrow(
      'HTTP 503',
    );
    await expect(client.loadAPI('example', 'current', 'en')).rejects.toThrow('HTTP 502');
    const loaded = await client.loadAPI('example', 'current', 'en');

    expect(loaded.project).toEqual(project);
    expect(await client.loadAPI('example', 'current', 'en')).toBe(loaded);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
});
