import { describe, expect, it, vi } from 'vitest';
import { loadJSON, loadText } from '@galacean/docs-site';

describe('shared resource loaders', () => {
  it('loads JSON and text through an injected fetcher', async () => {
    const fetcher: typeof fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ready: true }))
      .mockResolvedValueOnce(new Response('manual body'));

    await expect(loadJSON('/manifest.json', fetcher)).resolves.toEqual({
      ready: true,
    });
    await expect(loadText('/page.md', fetcher)).resolves.toBe('manual body');
    expect(fetcher).toHaveBeenNthCalledWith(1, '/manifest.json');
    expect(fetcher).toHaveBeenNthCalledWith(2, '/page.md');
  });

  it('reports the same HTTP status and resource URL for both response types', async () => {
    const fetcher: typeof fetch = vi.fn(
      async () => new Response('', { status: 503 }),
    );

    await expect(loadJSON('/broken.json', fetcher)).rejects.toThrow(
      'HTTP 503: /broken.json',
    );
    await expect(loadText('/broken.md', fetcher)).rejects.toThrow(
      'HTTP 503: /broken.md',
    );
  });
});
