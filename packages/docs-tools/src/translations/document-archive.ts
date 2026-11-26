import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { isRecord } from '@galacean/docs-site';
import { writeFileAtomically } from '../atomic-write';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { contentHash } from '../content-hash';
import { assertNoSymlinkPath, isSafePathSegment } from '../path-validation';
import { readOptionalJSON } from '../read-json';
import { readOptionalText } from '../read-optional-text';
import { documentSourceHash } from './document-model';
import type { DocumentTranslation, TranslationDocument } from './document-model';

export function documentArchivePath(config: ResolvedDocsBuildConfig, document: Pick<TranslationDocument, 'kind' | 'owner' | 'key' | 'format'>, locale: string): string {
  if (![document.owner, document.key, locale].every(isSafePathSegment) || !config.locales.includes(locale)) {
    throw new Error('Unsafe document translation identity');
  }
  const directory = config.translationCacheDirectory ?? path.join(config.repositoryRoot, 'tmp/docs-tools/translation-cache');
  const extension = document.format === 'html' ? 'html' : 'md';

  return document.kind === 'manual' ? path.join(directory, 'manual', document.owner, locale, `${document.key}.${extension}`) :
    path.join(directory, 'package-readmes', document.owner, `${locale}.md`);
}

export async function archiveStateHash(config: ResolvedDocsBuildConfig, filename: string): Promise<string> {
  return contentHash({ content: await readOptionalText(config.repositoryRoot, filename) ?? null,
    metadata: await readOptionalText(config.repositoryRoot, `${filename}.meta.json`) ?? null });
}

export async function readDocumentTranslation(config: ResolvedDocsBuildConfig, document: Omit<TranslationDocument, 'slug' | 'maintainedFiles'>, locale: string): Promise<DocumentTranslation> {
  const filename = documentArchivePath(config, document, locale);
  const content = await readOptionalText(config.repositoryRoot, filename);
  const metadataPath = `${filename}.meta.json`;

  await assertNoSymlinkPath(config.repositoryRoot, metadataPath);
  const metadata = await readOptionalJSON(metadataPath);

  if (content === undefined) {
    return { status: metadata === undefined ? 'missing' : 'needs-review' };
  }
  if (!isRecord(metadata) || metadata['schemaVersion'] !== 1 || metadata['sourceHash'] !== documentSourceHash(document) ||
    metadata['contentHash'] !== contentHash(content) || metadata['locale'] !== locale ||
    metadata['sourceLocale'] !== document.sourceLocale || metadata['owner'] !== document.owner ||
    metadata['key'] !== document.key || metadata['kind'] !== document.kind || content.trim() === '') {
    return { status: 'needs-review' };
  }
  const title = metadata['title'];
  const group = metadata['group'];

  if (typeof title !== 'string' || typeof group !== 'string') {
    return { status: 'needs-review' };
  }

  // The commit metadata is authoritative; navigation.json is a rebuildable index.
  return { status: 'translated', content, title, group };
}

export interface TranslatedDocument {
  document: TranslationDocument;
  locale: string;
  content: string;
  title: string;
  group: string;
}

export async function archiveDocumentTranslation(
  config: ResolvedDocsBuildConfig,
  { document, locale, content, title, group }: TranslatedDocument,
): Promise<string> {
  const { kind } = document;
  const filename = documentArchivePath(config, document, locale);

  const files: { filename: string; content: string }[] = [{ filename, content }];

  if (kind === 'manual') {
    const navigationPath = path.join(path.dirname(filename), 'navigation.json');

    await assertNoSymlinkPath(config.repositoryRoot, navigationPath);
    const existing = await readOptionalJSON(navigationPath);

    if (existing !== undefined && !isRecord(existing)) {
      throw new Error('Invalid archive navigation');
    }
    files.push({ filename: navigationPath, content: `${JSON.stringify({ ...existing as Record<string, unknown> | undefined, [document.key]: { title, group } }, null, 2)}\n` });
  }
  files.push({ filename: `${filename}.meta.json`, content: `${JSON.stringify({ schemaVersion: 1, kind, owner: document.owner, key: document.key,
    locale, sourceLocale: document.sourceLocale, sourceHash: documentSourceHash(document), contentHash: contentHash(content), title, group }, null, 2)}\n` });
  const previous = await Promise.all(files.map(file => readOptionalText(config.repositoryRoot, file.filename)));

  await mkdir(path.dirname(filename), { recursive: true });
  const written: number[] = [];

  try {
    // Commit metadata last; readers verify its body hash during the short commit window.
    for (const [index, file] of files.entries()) {
      await writeFileAtomically(file.filename, file.content);
      written.push(index);
    }
  } catch (error) {
    for (const index of written.reverse()) {
      const file = files[index]!;
      const old = previous[index];

      if (old === undefined) {
        await rm(file.filename, { force: true });
      } else {
        await writeFileAtomically(file.filename, old);
      }
    }
    throw error;
  }

  return filename;
}
