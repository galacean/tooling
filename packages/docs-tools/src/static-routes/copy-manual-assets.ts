import { isManualAssetPath, manualChapterSlug, type DocsRoutes } from '@galacean/docs-site';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { getErrorCode } from '../fs-errors';
import { manualLinkTargets } from '../manual/assets';
import type { ManualNavigationItem } from '../manual/navigation';
import { assertNoSymlinkPath, isSafePathSegment, isWithin } from '../path-validation';
import type { StaticRoute } from './collect-routes';

export async function copyManualAssets(
  config: ResolvedDocsBuildConfig,
  paths: DocsRoutes,
  locale: string,
  navigation: ManualNavigationItem[],
  routes: ReadonlyMap<string, StaticRoute>,
  dist: string,
): Promise<void> {
  const manualPrefix = paths.manual(locale);
  const chapters = new Set(navigation.map(page => page.slug));
  const pages = [
    { slug: undefined, format: 'markdown' as const },
    ...navigation.map(manual => ({ slug: manual.slug, format: manual.format?.[locale] ?? 'markdown' })),
  ];

  for (const manual of pages) {
    const format = manual.format;
    const extension = format === 'html' ? 'html' : 'md';
    const contentPath = path.join(
      config.manualDirectory,
      locale,
      `${manual.slug ?? 'index'}.${extension}`,
    );
    let content: string;

    try {
      content = await readFile(contentPath, 'utf8');
    } catch (error) {
      if (manual.slug === undefined && getErrorCode(error) === 'ENOENT') {
        continue;
      }
      throw error;
    }
    const pageURL = new URL(paths.manual(locale, manual.slug), 'https://local.invalid');
    const targets = manualLinkTargets(content, format);

    for (const target of targets) {
      if (
        /^(?:https?:|mailto:|tel:|data:|\/\/)/iu.test(target)
      ) {
        continue;
      }
      const url = new URL(target, pageURL);

      if (routes.has(url.pathname)) {
        continue;
      }
      const inManual = url.pathname.startsWith(manualPrefix);
      const asset = url.pathname.slice(manualPrefix.length);
      const chapter = manualChapterSlug(asset);

      if (inManual && chapter !== undefined && chapters.has(chapter)) {
        continue;
      }
      if (!inManual || !isManualAssetPath(asset)) {
        throw new Error(
          `Invalid manual link: ${locale}/${manual.slug} -> ${target}`,
        );
      }
      const assetSegments = asset.split('/')
        .map(decodeURIComponent);
      const assetPath = path.resolve(
        config.manualDirectory,
        locale,
        ...assetSegments,
      );

      if (
        assetSegments.some(segment => !isSafePathSegment(segment)) ||
        !isWithin(path.join(config.manualDirectory, locale), assetPath)
      ) {
        throw new Error(
          `Unsafe manual asset link: ${locale}/${manual.slug} -> ${target}`,
        );
      }
      await assertNoSymlinkPath(config.repositoryRoot, assetPath);
      let metadata;

      try {
        metadata = await stat(assetPath);
      } catch (error) {
        if (getErrorCode(error) === 'ENOENT') {
          throw new Error(
            `Manual asset does not exist: ${locale}/${manual.slug} -> ${target}`,
            { cause: error },
          );
        }
        throw error;
      }
      if (!metadata.isFile()) {
        throw new Error(
          `Manual asset is not a file: ${locale}/${manual.slug} -> ${target}`,
        );
      }
      const outputPath = path.join(dist, ...manualPrefix.split('/').filter(Boolean).map(decodeURIComponent), ...assetSegments);

      await assertNoSymlinkPath(dist, outputPath);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await copyFile(assetPath, outputPath);
    }
  }
}
