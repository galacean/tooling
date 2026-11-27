import { isDocsTarget, isRecord } from '@galacean/docs-site';
import type { DocsTarget } from '@galacean/docs-site';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isWithin } from '../path-validation';

function isSearchLinkArray(value: unknown): value is { target: DocsTarget }[] {
  return (
    Array.isArray(value) &&
    value.every(item => isRecord(item) && isDocsTarget(item['target']))
  );
}

export function validateSearchRoutes(
  index: unknown,
  locale: string,
  routes: ReadonlyMap<string, unknown>,
  href: (target: DocsTarget) => string,
): void {
  if (!isSearchLinkArray(index)) {
    throw new Error(`Invalid search index: ${locale}`);
  }
  for (const { target } of index) {
    const { pathname } = new URL(href(target), 'https://local.invalid');

    if (!routes.has(pathname)) {
      throw new Error(`Search route has no static entry: ${pathname}`);
    }
  }
}

async function directoryBytes(directory: string): Promise<number> {
  let bytes = 0;

  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);

      if (entry.isSymbolicLink()) {
        throw new Error(`Symlink in static site artifact: ${filename}`);
      }
      if (entry.isDirectory()) {
        await visit(filename);
      } else {
        const metadata = await stat(filename);

        if (metadata.nlink > 1) {
          throw new Error(`Hard link in static site artifact: ${filename}`);
        }
        bytes += metadata.size;
      }
    }
  }

  await visit(directory);

  return bytes;
}

export async function validateStaticArtifact(
  dist: string,
  base: string,
  resources: readonly string[],
  routeCount: number,
): Promise<number> {
  for (const resource of resources) {
    if (/^(?:#|[a-z][a-z\d+.-]*:|\/\/)/iu.test(resource)) {
      continue;
    }
    if (!resource.startsWith(base)) {
      throw new Error(`Resource is outside site base ${base}: ${resource}`);
    }
    const pathname = decodeURIComponent(new URL(resource, 'https://local.invalid').pathname);
    const filename = path.join(dist, pathname.slice(base.length));

    if (!pathname.startsWith(base) || !isWithin(dist, filename)) {
      throw new Error(`Resource is outside site base ${base}: ${resource}`);
    }
    await stat(filename);
  }
  const bytes = await directoryBytes(dist);

  if (bytes > 500 * 1024 * 1024) {
    throw new Error(
      `Static site artifact too large: ${routeCount} routes, ${bytes} bytes`,
    );
  }

  return bytes;
}
