import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { getErrorCode } from '../fs-errors';
import type { ManualNavigationItem } from '../manual/navigation';
import { assertNoSymlinkPath, isSafePathSegment, isWithin } from '../path-validation';
import type { StaticRoute } from './collect-routes';

export async function copyManualAssets(
  config: ResolvedDocsBuildConfig,
  locale: string,
  navigation: ManualNavigationItem[],
  routes: ReadonlyMap<string, StaticRoute>,
  dist: string,
): Promise<void> {
  for (const manual of navigation) {
    const format = manual.format?.[locale] ?? 'markdown';
    const extension = format === 'html' ? 'html' : 'md';
    const contentPath = path.join(
      config.manualDirectory,
      locale,
      `${manual.slug}.${extension}`,
    );
    const content = await readFile(contentPath, 'utf8');
    const targets =
      format === 'html'
        ? [
            ...content.matchAll(
              /(?:^|[\s<])(?:href|src)\s*=\s*["']([^"']+)["']/giu,
            ),
          ].map(match => match[1])
        : [...content.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/gu)].map(
            match => match[1],
          );

    for (const target of targets) {
      if (
        target === undefined ||
        /^(?:https?:|mailto:|tel:|data:|\/\/)/iu.test(target)
      ) {
        continue;
      }
      const url = new URL(
        target,
        `https://local.invalid/${locale}/manual/${manual.slug}/`,
      );

      if (routes.has(url.pathname)) {
        continue;
      }
      const manualPrefix = `/${locale}/manual/`;

      if (
        !/\.(?:png|jpe?g|gif|webp|svg|pdf|mp4|webm|zip)$/iu.test(
          url.pathname,
        ) ||
        !url.pathname.startsWith(manualPrefix)
      ) {
        throw new Error(
          `Invalid manual link: ${locale}/${manual.slug} -> ${target}`,
        );
      }
      const assetSegments = url.pathname
        .slice(manualPrefix.length)
        .split('/')
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
      const outputPath = path.join(dist, locale, 'manual', ...assetSegments);

      await assertNoSymlinkPath(dist, outputPath);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await copyFile(assetPath, outputPath);
    }
  }
}
