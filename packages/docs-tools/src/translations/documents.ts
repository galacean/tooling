import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isRecord } from '@galacean/docs-site';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { assertNoSymlinkPath, isWithin } from '../path-validation';
import { readOptionalText } from '../read-optional-text';
import { archiveDocumentTranslation, archiveStateHash, documentArchivePath, readDocumentTranslation } from './document-archive';
import type { TranslatedDocument } from './document-archive';
import { inventoryDocuments } from './document-inventory';
import { documentSourceHash } from './document-model';
import type { DocumentKind, DocumentTranslation, TranslationDocument, TranslationStatus } from './document-model';
import { validateDocumentTranslation } from './document-validation';
import { withTranslationLock } from './lock';
import { selectTargetLocales, validateSourceSelection } from './selection';
import type { TranslationSelectionOptions } from './selection';

export { documentArchivePath, documentSourceHash, inventoryDocuments, readDocumentTranslation, validateDocumentTranslation };
export type { DocumentKind, DocumentTranslation, TranslationDocument, TranslationStatus };

interface DocumentTask {
  schemaVersion: 1;
  kind: DocumentKind;
  owner: string;
  key: string;
  sourceLocale: string;
  locale: string;
  format: 'markdown' | 'html';
  sourceHash: string;
  targetHash: string;
  content: string;
  title: string;
  group: string;
}

export async function getDocumentTranslationStatus(kind: DocumentKind, config: ResolvedDocsBuildConfig, options: TranslationSelectionOptions = {}) {
  const documents = await inventoryDocuments(kind, config);

  validateSourceSelection(documents.map(document => document.sourceLocale), options.sourceLocale);
  const owners = kind === 'manual' ? options.collections : options.packages;

  if (owners?.some(owner => !documents.some(document => document.owner === owner)) === true) {
    throw new Error(`Unknown ${kind} owner selection`);
  }
  if (options.pages?.some(page => !documents.some(document => document.slug === page || document.key === page)) === true) {
    throw new Error('Unknown manual page selection');
  }
  const results: { document: TranslationDocument; locale: string; translation: DocumentTranslation }[] = [];

  for (const document of documents) {
    if (options.sourceLocale !== undefined && options.sourceLocale !== 'all' && options.sourceLocale !== document.sourceLocale ||
      owners !== undefined && !owners.includes(document.owner) || options.pages !== undefined && !options.pages.includes(document.slug) && !options.pages.includes(document.key)) {
      continue;
    }
    for (const locale of selectTargetLocales(config.locales, document.sourceLocale, options)) {
      const maintained = document.maintainedFiles[locale];
      const content = maintained === undefined ? undefined : await readOptionalText(config.repositoryRoot, maintained);
      const translation = content === undefined ? await readDocumentTranslation(config, document, locale) : { status: 'translated' as const, content };

      if (content?.trim() === '') {
        throw new Error(`Empty maintained translation: ${maintained}`);
      }
      results.push({ document, locale, translation });
    }
  }

  return results;
}

export async function extractDocumentTranslations(kind: DocumentKind, config: ResolvedDocsBuildConfig, options: TranslationSelectionOptions = {}) {
  const pending = (await getDocumentTranslationStatus(kind, config, options)).filter(item => item.translation.status !== 'translated');
  const tasks: { taskPath: string; owner: string; key: string; locale: string; status: TranslationStatus }[] = [];
  let directory: string | undefined;

  if (pending.length > 0 && options.dryRun !== true) {
    const work = path.join(config.translationDirectory ?? path.join(config.repositoryRoot, 'tmp/docs-tools'), `${kind}-translation`);

    await assertNoSymlinkPath(config.repositoryRoot, work);
    await mkdir(work, { recursive: true });
    directory = await mkdtemp(path.join(work, 'run-'));
  }
  for (const { document, locale, translation } of pending) {
    const filename = documentArchivePath(config, document, locale);
    const task: DocumentTask = { schemaVersion: 1, kind, owner: document.owner, key: document.key,
      sourceLocale: document.sourceLocale, locale, format: document.format,
      sourceHash: documentSourceHash(document), targetHash: await archiveStateHash(config, filename),
      content: document.content, title: document.title, group: document.group };
    const taskPath = directory === undefined ? '' : path.join(directory, `${String(tasks.length + 1).padStart(3, '0')}.task.json`);

    if (taskPath !== '') {
      await writeFile(taskPath, `${JSON.stringify(task, null, 2)}\n`, { flag: 'wx' });
    }
    tasks.push({ taskPath, owner: document.owner, key: document.key, locale, status: translation.status });
  }

  return tasks;
}

export async function applyDocumentTranslations(kind: DocumentKind, config: ResolvedDocsBuildConfig, pairs: { taskPath: string; translationPath: string }[]): Promise<string[]> {
  return withTranslationLock(config, kind, () => applyDocumentTranslationsUnlocked(kind, config, pairs));
}

async function applyDocumentTranslationsUnlocked(kind: DocumentKind, config: ResolvedDocsBuildConfig, pairs: { taskPath: string; translationPath: string }[]): Promise<string[]> {
  const documents = await inventoryDocuments(kind, config);
  const outputs: TranslatedDocument[] = [];
  const identities = new Set<string>();

  for (const pair of pairs) {
    const taskPath = path.resolve(config.repositoryRoot, pair.taskPath);
    const translationPath = path.resolve(config.repositoryRoot, pair.translationPath);
    const work = config.translationDirectory ?? path.join(config.repositoryRoot, 'tmp/docs-tools');

    if (!isWithin(work, taskPath, 'descendant') || !isWithin(work, translationPath, 'descendant')) {
      throw new Error('Document tasks and translation results must stay inside translationDirectory');
    }
    await assertNoSymlinkPath(config.repositoryRoot, taskPath);
    await assertNoSymlinkPath(config.repositoryRoot, translationPath);
    const task: unknown = JSON.parse(await readFile(taskPath, 'utf8'));
    const result: unknown = JSON.parse(await readFile(translationPath, 'utf8'));

    if (!isRecord(task) || task['schemaVersion'] !== 1 || task['kind'] !== kind || typeof task['locale'] !== 'string') {
      throw new Error('Invalid document translation task');
    }
    const document = documents.find(document => document.owner === task['owner'] && document.key === task['key']);
    const locale = task['locale'];

    if (document === undefined || !config.locales.includes(locale) || locale === document.sourceLocale ||
      task['sourceLocale'] !== document.sourceLocale || task['format'] !== document.format || task['sourceHash'] !== documentSourceHash(document) ||
      task['content'] !== document.content || task['title'] !== document.title || task['group'] !== document.group) {
      throw new Error('Stale document task; extract it again');
    }
    const filename = documentArchivePath(config, document, locale);

    if (task['targetHash'] !== await archiveStateHash(config, filename)) {
      throw new Error('Document target changed; extract a fresh task');
    }
    if (!isRecord(result) || result['locale'] !== locale || result['sourceHash'] !== task['sourceHash'] ||
      typeof result['content'] !== 'string' || typeof result['title'] !== 'string' || result['title'].trim() === '' || typeof result['group'] !== 'string' ||
      Object.keys(result).some(key => !['locale', 'sourceHash', 'content', 'title', 'group'].includes(key))) {
      throw new Error('Invalid document translation result');
    }
    const identity = `${document.owner}/${document.key}/${locale}`;

    if (identities.has(identity)) {
      throw new Error(`Duplicate document translation: ${identity}`);
    }
    identities.add(identity);
    const maintained = document.maintainedFiles[locale];

    if (maintained !== undefined && await readOptionalText(config.repositoryRoot, maintained) !== undefined) {
      throw new Error('A maintained target file exists; update that file explicitly instead');
    }
    validateDocumentTranslation(document.content, result['content'], document.format);
    outputs.push({ document, locale, content: result['content'], title: result['title'], group: result['group'] });
  }
  const filenames: string[] = [];

  for (const output of outputs) {
    filenames.push(await archiveDocumentTranslation(config, output));
  }

  return filenames;
}
