import { describe, expect, it, vi } from 'vitest';
import { loadJSON } from '@galacean/docs-site';

describe('shared resource loaders', () => {
  it('loads JSON through an injected fetcher', async () => {
    const fetcher: typeof fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ready: true }));

    await expect(loadJSON('/manifest.json', fetcher)).resolves.toEqual({
      ready: true,
    });
    expect(fetcher).toHaveBeenNthCalledWith(1, '/manifest.json');
  });

  it('reports the HTTP status and resource URL', async () => {
    const fetcher: typeof fetch = vi.fn(
      async () => new Response('', { status: 503 }),
    );

    await expect(loadJSON('/broken.json', fetcher)).rejects.toThrow(
      'HTTP 503: /broken.json',
    );
  });
});
