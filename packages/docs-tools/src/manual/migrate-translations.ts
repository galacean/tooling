import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomically } from '../atomic-write';
import type { ResolvedDocsBuildConfig, ManualCollectionConfig } from '../config/types';
import { assertNoSymlinkPath, isWithin } from '../path-validation';
import { parseJSON } from '../api/read-json';
import { isSafeSlug } from '../config/validation';

export interface ManualTranslationMigrationInput {
  collectionKey: string;
  locale: string;
  legacyDirectory: string;
}

export interface ManualTranslationMigrationResult {
  migrated: number;
  skipped: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function manualDocumentKey(item: Record<string, unknown>): string | undefined {
  const slug = item['slug'];
  const source = item['source'];

  if (typeof slug !== 'string' || !isSafeSlug(slug) || !isRecord(source)) {
    return undefined;
  }
  if (source['type'] === 'yuque') {
    if (
      typeof source['namespace'] !== 'string' ||
      typeof source['slug'] !== 'string'
    ) {
      return undefined;
    }

    return typeof source['docId'] === 'string'
      ? `doc-${encodeURIComponent(source['docId'])}`
      : `source-${encodeURIComponent(source['namespace'])}-${encodeURIComponent(source['slug'])}`;
  }
  if (source['type'] === 'local') {
    return slug;
  }

  return undefined;
}

function belongsToCollection(
  item: Record<string, unknown>,
  collection: ManualCollectionConfig,
): boolean {
  const source = item['source'];

  if (!isRecord(source)) {
    return false;
  }
  if (collection.source.type === 'local') {
    return source['type'] === 'local' && (
      collection.routePrefix === undefined ||
      (typeof item['slug'] === 'string' &&
        (item['slug'] === collection.routePrefix ||
          item['slug'].startsWith(`${collection.routePrefix}-`)))
    );
  }
  if (source['type'] !== 'yuque') {
    return false;
  }
  if (collection.source.mode === 'repo') {
    return source['namespace'] === collection.source.namespace;
  }

  return collection.source.documents.some(
    document =>
      document.namespace === source['namespace'] &&
      document.slug === source['slug'],
  );
}

export async function migrateManualTranslations(
  config: ResolvedDocsBuildConfig,
  inputs: ManualTranslationMigrationInput[],
): Promise<ManualTranslationMigrationResult> {
  if (inputs.length === 0) {
    throw new Error('Provide at least one collection/locale/legacy-directory mapping');
  }
  const navigationPath = path.join(config.manualDirectory, 'navigation.json');

  await assertNoSymlinkPath(config.repositoryRoot, navigationPath);
  const navigation: unknown = parseJSON(
    await readFile(navigationPath, 'utf8'),
    navigationPath,
  );

  if (!Array.isArray(navigation)) {
    throw new Error(`Invalid manual navigation: ${navigationPath}`);
  }
  const cacheDirectory = config.translationCacheDirectory ??
    path.join(config.repositoryRoot, 'tmp/docs-tools/translation-cache');
  let migrated = 0;
  let skipped = 0;

  for (const input of inputs) {
    const collection = config.manuals?.find(
      item => item.key === input.collectionKey,
    );

    if (collection === undefined) {
      throw new Error(`Unknown manual collection: ${input.collectionKey}`);
    }
    if (
      input.locale === collection.source.locale ||
      !config.locales.includes(input.locale)
    ) {
      throw new Error(`Invalid target locale for manual migration: ${input.locale}`);
    }
    const legacyDirectory = path.resolve(config.repositoryRoot, input.legacyDirectory);

    if (!isWithin(config.repositoryRoot, legacyDirectory)) {
      throw new Error(`Manual migration directory leaves repository: ${input.legacyDirectory}`);
    }
    await assertNoSymlinkPath(config.repositoryRoot, legacyDirectory);
    const archiveDirectory = path.join(
      cacheDirectory,
      'manual',
      collection.key,
      input.locale,
    );

    await assertNoSymlinkPath(config.repositoryRoot, archiveDirectory);
    const oldNavigationPath = path.join(legacyDirectory, 'navigation.json');
    let oldNavigation: unknown = {};

    try {
      oldNavigation = parseJSON(
        await readFile(oldNavigationPath, 'utf8'),
        oldNavigationPath,
      );
    } catch (error) {
      if (!(isRecord(error) && error['code'] === 'ENOENT')) {
        throw error;
      }
    }
    const localizedNavigation: Record<string, unknown> = {};

    try {
      const currentPath = path.join(archiveDirectory, 'navigation.json');

      await assertNoSymlinkPath(config.repositoryRoot, currentPath);
      const current: unknown = parseJSON(
        await readFile(currentPath, 'utf8'),
        currentPath,
      );

      if (isRecord(current)) {
        Object.assign(localizedNavigation, current);
      }
    } catch (error) {
      if (!(isRecord(error) && error['code'] === 'ENOENT')) {
        throw error;
      }
    }
    await mkdir(archiveDirectory, { recursive: true });

    for (const item of navigation) {
      if (!isRecord(item) || !belongsToCollection(item, collection)) {
        continue;
      }
      const routeSlug = item['slug'];
      const documentKey = manualDocumentKey(item);

      if (typeof routeSlug !== 'string' || documentKey === undefined) {
        skipped += 1;
        continue;
      }
      const candidates = await Promise.all(
        (['md', 'html'] as const).map(async extension => {
          const legacyPath = path.join(legacyDirectory, `${routeSlug}.${extension}`);

          await assertNoSymlinkPath(config.repositoryRoot, legacyPath);
          try {
            return {
              extension,
              content: await readFile(legacyPath, 'utf8'),
            };
          } catch (error) {
            if (isRecord(error) && error['code'] === 'ENOENT') {
              return undefined;
            }
            throw error;
          }
        }),
      );
      const existingCandidates = candidates.filter(
        (candidate): candidate is NonNullable<typeof candidate> =>
          candidate !== undefined,
      );

      if (existingCandidates.length === 0) {
        continue;
      }
      if (existingCandidates.length > 1) {
        throw new Error(
          `Ambiguous legacy manual translations for ${collection.key}/${routeSlug}`,
        );
      }
      const legacyTranslation = existingCandidates[0];

      if (legacyTranslation === undefined || legacyTranslation.content.trim() === '') {
        skipped += 1;
        continue;
      }
      const archivePath = path.join(
        archiveDirectory,
        `${documentKey}.${legacyTranslation.extension}`,
      );

      await assertNoSymlinkPath(config.repositoryRoot, archivePath);
      try {
        await writeFile(archivePath, legacyTranslation.content, { flag: 'wx' });
        migrated += 1;
      } catch (error) {
        if (isRecord(error) && error['code'] === 'EEXIST') {
          skipped += 1;
        } else {
          throw error;
        }
      }
      const localized = isRecord(oldNavigation)
        ? oldNavigation[routeSlug]
        : undefined;

      if (isRecord(localized) && localizedNavigation[documentKey] === undefined) {
        localizedNavigation[documentKey] = localized;
      }
    }
    const navigationTarget = path.join(archiveDirectory, 'navigation.json');

    await assertNoSymlinkPath(config.repositoryRoot, navigationTarget);
    await writeFileAtomically(
      navigationTarget,
      `${JSON.stringify(localizedNavigation, null, 2)}\n`,
    );
  }

  return { migrated, skipped };
}
