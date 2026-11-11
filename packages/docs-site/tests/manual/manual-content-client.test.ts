import { describe, expect, it, vi } from 'vitest';
import { createManualContentClient } from '@galacean/docs-site';

const locales = ['zh-CN', 'en'] as const;
const navigation = [
  {
    slug: 'getting-started',
    title: { 'zh-CN': '开始使用', en: 'Getting started' },
    group: { 'zh-CN': '指南', en: 'Guide' },
  },
];

describe('shared manual content client', () => {
  it('caches valid navigation, projects localized labels, and extracts headings', async () => {
    const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('.json')
        ? Response.json(navigation)
        : String(input).endsWith('/index.md')
          ? new Response('# Intro\n\n## Install\n\n### Detail\n\n## Next\n')
          : new Response('# Intro\n\n## Install\n\n### Detail\n\n## Next\n', {
            headers: { 'Last-Modified': 'Fri, 06 Nov 2026 10:32:54 GMT' },
          }),
    );
    const client = createManualContentClient({
      baseURL: '/site/',
      locales,
      fetcher,
    });
    const [first, second] = await Promise.all([
      client.loadNavigation(),
      client.loadNavigation(),
    ]);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(first).toBe(second);
    expect(client.manualPages('en', first)).toEqual([
      { slug: 'getting-started', title: 'Getting started', group: 'Guide' },
    ]);
    expect(await client.loadPage('zh-CN', 'getting-started', first)).toEqual({
      slug: 'getting-started',
      title: '开始使用',
      text: '# Intro\n\n## Install\n\n### Detail\n\n## Next\n',
      headings: ['Install', 'Next'],
      lastModified: 'Fri, 06 Nov 2026 10:32:54 GMT',
    });
    expect(await client.loadOverview('en')).toEqual({
      text: '# Intro\n\n## Install\n\n### Detail\n\n## Next\n',
      headings: ['Install', 'Next'],
    });
  });

  it('retries failed or invalid navigation and rejects unknown slugs before fetching', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json(navigation));
    const client = createManualContentClient({
      baseURL: '/',
      locales,
      fetcher,
    });

    await expect(client.loadNavigation()).rejects.toThrow('HTTP 503');
    await expect(client.loadNavigation()).rejects.toThrow(
      'Invalid manual navigation data',
    );
    const valid = await client.loadNavigation();

    await expect(client.loadPage('en', 'missing', valid)).rejects.toThrow(
      'Missing manual en/missing',
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('prefers locale-specific last-modified metadata when response headers are unavailable', async () => {
    const datedNavigation = [
      {
        ...navigation[0],
        lastModified: { 'zh-CN': '2026-11-10', en: '2026-11-09' },
      },
    ];
    const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('.json')
        ? Response.json(datedNavigation)
        : new Response('# Intro\n\n## Install\n'),
    );
    const client = createManualContentClient({
      baseURL: '/site/',
      locales,
      fetcher,
    });
    const pages = await client.loadNavigation();

    await expect(
      client.loadPage('zh-CN', 'getting-started', pages),
    ).resolves.toMatchObject({ lastModified: '2026-11-10' });
    await expect(
      client.loadPage('en', 'getting-started', pages),
    ).resolves.toMatchObject({ lastModified: '2026-11-09' });
  });

  it('prefers the response Last-Modified header over navigation metadata', async () => {
    const datedNavigation = [
      {
        ...navigation[0],
        lastModified: { 'zh-CN': '2026-11-10', en: '2026-11-09' },
      },
    ];
    const fetcher: typeof fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('.json')
        ? Response.json(datedNavigation)
        : new Response('# Intro\n', {
            headers: { 'Last-Modified': 'Fri, 06 Nov 2026 10:32:54 GMT' },
          }),
    );
    const client = createManualContentClient({
      baseURL: '/site/',
      locales,
      fetcher,
    });
    const pages = await client.loadNavigation();

    await expect(
      client.loadPage('en', 'getting-started', pages),
    ).resolves.toMatchObject({
      lastModified: 'Fri, 06 Nov 2026 10:32:54 GMT',
    });
  });
});
