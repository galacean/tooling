import path from 'node:path';
import { isRecord } from '@galacean/docs-site';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { assertNoSymlinkPath, isSafePathSegment } from '../path-validation';
import { readOptionalJSON } from '../read-json';
import { manualContentHash, readGeneratedHashes } from '../manual/generated-hashes';
import { readOptionalText } from '../read-optional-text';
import type { DocumentKind, TranslationDocument } from './document-model';

async function readSource(config: ResolvedDocsBuildConfig, filename: string): Promise<string> {
  const content = await readOptionalText(config.repositoryRoot, filename);

  if (content === undefined || content.trim() === '') {
    throw new Error(`Missing or empty translation source: ${filename}`);
  }

  return content;
}

export async function inventoryDocuments(kind: DocumentKind, config: ResolvedDocsBuildConfig): Promise<TranslationDocument[]> {
  const documents: TranslationDocument[] = [];

  if (kind === 'package-readmes') {
    for (const pkg of config.apiPackages ?? []) {
      if (pkg.readme === undefined) {
        continue;
      }
      const sourceLocale = pkg.readme.sourceLocale ?? config.sourceLocale;
      const source = pkg.readme.files[sourceLocale];

      if (source === undefined) {
        throw new Error(`Missing README source mapping: ${pkg.key}`);
      }
      documents.push({ kind, owner: pkg.key, key: 'readme', slug: pkg.key, sourceLocale, format: 'markdown',
        content: await readSource(config, source), title: pkg.name, group: '', maintainedFiles: pkg.readme.files });
    }

    return documents;
  }
  const generatedHashes = await readGeneratedHashes(config.repositoryRoot, config.manualDirectory);

  for (const collection of config.manuals ?? []) {
    const directory = collection.source.type === 'local' ? collection.source.directory : config.manualDirectory;
    const usesPublishedLocalSource = collection.source.type === 'local' &&
      path.resolve(directory) === path.resolve(config.manualDirectory);
    const navigationPath = path.join(directory, 'navigation.json');

    await assertNoSymlinkPath(config.repositoryRoot, navigationPath);
    const navigation = await readOptionalJSON(navigationPath);

    if (!Array.isArray(navigation)) {
      throw new Error(`Sync the manual source before extracting translations: ${collection.key}`);
    }
    for (const item of navigation) {
      if (!isRecord(item) || typeof item['slug'] !== 'string' || !isSafePathSegment(item['slug']) || !isRecord(item['title']) || !isRecord(item['group'])) {
        throw new Error(`Invalid manual navigation: ${collection.key}`);
      }
      if (usesPublishedLocalSource &&
        (isRecord(item['source']) && item['source']['type'] !== 'local' || item['collectionKey'] !== undefined && item['collectionKey'] !== collection.key)) {
        continue;
      }
      if (collection.source.type === 'yuque' && item['collectionKey'] !== collection.key) {
        continue;
      }
      const slug = item['slug'];
      const sourceLocale = collection.source.locale;
      const format = isRecord(item['format']) && item['format'][sourceLocale] === 'html' ? 'html' : 'markdown';
      const extension = format === 'html' ? 'html' : 'md';
      const generatedLocal = usesPublishedLocalSource && item['collectionKey'] !== undefined;
      const key = collection.source.type === 'local' && !generatedLocal ? slug : item['documentKey'];

      if (typeof key !== 'string' || !isSafePathSegment(key)) {
        throw new Error(`Sync stable document identities before translating ${collection.key}/${slug}`);
      }
      const maintainedFiles: Record<string, string> = {};

      if (collection.source.type === 'local') {
        for (const locale of config.locales) {
          const relativePath = `${locale}/${slug}.${extension}`;
          const filename = path.join(directory, relativePath);
          const generatedHash = usesPublishedLocalSource ? generatedHashes.get(relativePath) : undefined;

          if (generatedHash !== undefined) {
            const content = await readOptionalText(config.repositoryRoot, filename);

            if (content !== undefined && manualContentHash(content) === generatedHash) {
              continue;
            }
          }
          maintainedFiles[locale] = filename;
        }
      }
      documents.push({
        kind, owner: collection.key, key, slug, sourceLocale, format,
        content: await readSource(config, path.join(directory, sourceLocale, `${slug}.${extension}`)),
        title: String(item['title'][sourceLocale] ?? ''),
        group: String(item['group'][sourceLocale] ?? ''),
        maintainedFiles,
      });
    }
  }

  return documents;
}
