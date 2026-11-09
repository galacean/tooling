import { describe, expect, it, vi } from 'vitest';
import { createAPIDocumentationClient } from '@galacean/docs-site';

const snapshot = 'a'.repeat(64);
const entry = {
  key: 'root',
  source: 'src/index.ts',
  types: './dist/index.d.ts',
  id: 1,
  symbols: [],
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

describe('shared API documentation client', () => {
  it('joins requests, caches per snapshot, and passes resolved package version metadata to the parser', async () => {
    const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      return Response.json(
        url.endsWith('manifest.json')
          ? manifest
          : url.includes('/snapshots/')
            ? { locale: 'en' }
          : url.endsWith('en.api.json')
            ? { $ref: 'api/snapshots/sha256/en.api.json' }
            : { locale: 'en' },
      );
    });
    const parseSnapshot = vi.fn(
      (
        raw: unknown,
        locale: string,
        apiVersion: { version: string },
        current: boolean,
      ) => ({ raw, locale, version: apiVersion.version, current }),
    );
    const client = createAPIDocumentationClient({
      baseURL: '/site/',
      locales: ['en', 'zh-CN'],
      parseSnapshot,
      fetcher,
    });
    const [first, second] = await Promise.all([
      client.loadAPI('example', 'current', 'en'),
      client.loadAPI('example', '1.0.0', 'en'),
    ]);

    await client.loadAPI('example', 'current', 'en');

    expect(first).toEqual({
      raw: { locale: 'en' },
      locale: 'en',
      version: 'current',
      current: true,
    });
    expect(second).toEqual({
      raw: { locale: 'en' },
      locale: 'en',
      version: '1.0.0',
      current: false,
    });
    expect(parseSnapshot).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce(Response.json({ locale: 'en' }))
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json({ locale: 'en' }));
    const parseSnapshot = vi.fn((raw: unknown) => raw);
    const client = createAPIDocumentationClient({
      baseURL: '/',
      locales: ['en'],
      parseSnapshot,
      fetcher,
    });

    await expect(client.loadAPI('example', 'current', 'en')).rejects.toThrow(
      'HTTP 503',
    );
    await expect(client.loadAPI('example', 'current', 'en')).resolves.toEqual({
      locale: 'en',
    });
    await expect(client.loadAPI('example', 'current', 'en')).resolves.toEqual({
      locale: 'en',
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
