import { createDocsRoutes, isManualAssetPath } from '@galacean/docs-site';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { manualContentHash } from './generated-hashes';
import { getErrorCode } from '../fs-errors';
import { assertNoSymlinkPath, isSafePathSegment } from '../path-validation';

export function manualLinkTargets(content: string, format: 'markdown' | 'html'): string[] {
  const links = format === 'html'
    ? content.matchAll(/(?:^|[\s<])(?:href|src)\s*=\s*["']([^"']+)["']/giu)
    : content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu);

  return Array.from(links, match => format === 'html' ? match[1]! :
    match[1]!.trim().replace(/\s+(?:"[^"]*"|'[^']*')$/u, '').replace(/^<(.+)>$/u, '$1'));
}

/** Keep opaque image/attachment paths valid when a source body is reused in another language. */
export async function copyManualPageAssets(config: ResolvedDocsBuildConfig, collectionKey: string | undefined,
  slug: string | undefined, sourceLocale: string, locale: string, format: 'markdown' | 'html', content: string, target: string,
  previousHashes: ReadonlyMap<string, string>, generatedHashes: Map<string, string>, inputSlug?: string): Promise<void> {
  const links = manualLinkTargets(content, format);
  const collection = config.manuals?.find(collection => collection.key === collectionKey);
  const root = collection?.source.type === 'local' ? collection.source.directory : config.manualDirectory;

  const routes = createDocsRoutes(config.routePaths);
  const prefix = routes.manual(locale);
  const pageURL = new URL(routes.manual(locale, slug), 'https://manual.invalid');

  for (const link of new Set(links)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(link)) {
      continue;
    }
    const url = new URL(link, pageURL);

    if (!url.pathname.startsWith(prefix) || !isManualAssetPath(url.pathname)) {
      continue;
    }
    const segments = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent);

    if (!segments.every(isSafePathSegment)) {
      throw new Error(`Unsafe manual asset: ${slug}/${link}`);
    }
    let source: Buffer | undefined;

    for (const directory of new Set([root, config.manualDirectory])) {
      const sourceSegments = directory === root && inputSlug !== undefined && segments[0] === slug
        ? [inputSlug, ...segments.slice(1)] : segments;

      for (const language of new Set([locale, sourceLocale])) {
        const relativePath = [language, ...sourceSegments].join('/');
        const candidate = path.join(directory, relativePath);

        await assertNoSymlinkPath(config.repositoryRoot, candidate);
        try {
          const bytes = await readFile(candidate);
          const previousHash = directory === config.manualDirectory ? previousHashes.get(relativePath) : undefined;

          if (previousHash !== undefined && previousHash === manualContentHash(bytes)) {
            continue;
          }
          source = bytes;
          if (language !== locale || directory !== config.manualDirectory) {
            generatedHashes.set([locale, ...segments].join('/'), manualContentHash(bytes));
          }

          break;
        } catch (error) {
          if (getErrorCode(error) !== 'ENOENT') {
            throw error;
          }
        }
      }
      if (source !== undefined) {
        break;
      }
    }
    if (source === undefined) {
      throw new Error(`Missing manual asset: ${locale}/${slug} -> ${link}`);
    }
    const destination = path.join(target, locale, ...segments);

    await assertNoSymlinkPath(config.repositoryRoot, destination);
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      const existing = await readFile(destination);

      if (!existing.equals(source)) {
        throw new Error(`Conflicting manual assets: ${locale}/${segments.join('/')}`);
      }
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') {
        throw error;
      }
      await writeFile(destination, source);
    }
  }
}
