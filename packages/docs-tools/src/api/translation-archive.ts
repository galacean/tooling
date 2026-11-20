import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomically } from '../atomic-write';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { assertNoSymlinkPath, isSafePathSegment } from '../path-validation';
import { parseVersion } from './versions';

export interface APITranslationArchive {
  locale: string;
  version: string;
  sourceHash: string;
  translations: Record<string, string>;
}

function archivePath(
  config: Pick<ResolvedDocsBuildConfig, 'repositoryRoot' | 'translationCacheDirectory'>,
  packageKey: string,
  version: string,
  locale: string,
): string {
  if (
    !isSafePathSegment(packageKey) ||
    !isSafePathSegment(locale) ||
    !/^[A-Za-z0-9-]+$/u.test(locale)
  ) {
    throw new Error('Invalid API translation archive path segment');
  }
  parseVersion(version);
  const cacheDirectory = config.translationCacheDirectory ??
    path.join(config.repositoryRoot, 'tmp/docs-tools/translation-cache');

  return path.join(cacheDirectory, 'api', packageKey, version, `${locale}.json`);
}

function parseArchive(value: unknown, filename: string): APITranslationArchive {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('locale' in value) ||
    typeof value.locale !== 'string' ||
    !('version' in value) ||
    typeof value.version !== 'string' ||
    !('sourceHash' in value) ||
    typeof value.sourceHash !== 'string' ||
    !('translations' in value) ||
    value.translations === null ||
    typeof value.translations !== 'object' ||
    Array.isArray(value.translations) ||
    Object.values(value.translations).some(item => typeof item !== 'string') ||
    Object.keys(value).some(
      key => !['locale', 'version', 'sourceHash', 'translations'].includes(key),
    )
  ) {
    throw new Error(`Invalid API translation archive: ${filename}`);
  }

  return value as APITranslationArchive;
}

export async function readAPITranslationArchive(
  config: Pick<ResolvedDocsBuildConfig, 'repositoryRoot' | 'translationCacheDirectory'>,
  packageKey: string,
  version: string,
  locale: string,
): Promise<APITranslationArchive | undefined> {
  const filename = archivePath(config, packageKey, version, locale);

  await assertNoSymlinkPath(config.repositoryRoot, filename);
  try {
    const value: unknown = JSON.parse(await readFile(filename, 'utf8'));
    const archive = parseArchive(value, filename);

    if (archive.locale !== locale || archive.version !== version) {
      throw new Error(`API translation archive metadata mismatch: ${filename}`);
    }

    return archive;
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function writeAPITranslationArchive(
  config: Pick<ResolvedDocsBuildConfig, 'repositoryRoot' | 'translationCacheDirectory'>,
  archive: APITranslationArchive,
  packageKey: string,
): Promise<string> {
  const filename = archivePath(
    config,
    packageKey,
    archive.version,
    archive.locale,
  );

  await assertNoSymlinkPath(config.repositoryRoot, filename);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFileAtomically(filename, `${JSON.stringify(archive, null, 2)}\n`);

  return filename;
}
