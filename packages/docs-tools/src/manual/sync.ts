import { getCommonMessages } from '@galacean/docs-site';
import { readDocumentTranslation } from '../translations/document-archive';
import type { DocumentTranslation, TranslationDocument } from '../translations/document-model';
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { getErrorCode } from '../fs-errors';
import { assertNoSymlinkPath } from '../path-validation';
import type {
  ResolvedDocsBuildConfig,
  ManualCollectionConfig,
} from '../config/types';
import { isSafeSlug } from '../config/validation';
import { parseJSON } from '../api/read-json';
import { readOptionalText } from '../read-optional-text';
import { generatedHashesFilename, manualContentHash, readGeneratedHashes } from './generated-hashes';
import { copyManualPageAssets } from './assets';

interface ManualNavigationItem {
  slug: string;
  collectionKey: string;
  documentKey: string;
  sourceLocale: string;
  title: Record<string, string>;
  group: Record<string, string>;
  parent?: string;
  format?: Record<string, 'markdown' | 'html'>;
  lastModified?: Record<string, string>;
  source?:
    | { type: 'yuque'; namespace: string; slug: string; docId?: string }
    | { type: 'local' };
}

interface ManualPage {
  inputSlug?: string;
  navigation: ManualNavigationItem;
  sourceLocale: string;
  content: string;
  format: 'markdown' | 'html';
  translations: Record<string, DocumentTranslation>;
}

interface YuqueTocNode {
  type: string;
  title: string;
  depth?: number;
  slug?: string;
  docId?: string;
  children: YuqueTocNode[];
}

interface YuqueDocument {
  id?: string | number;
  slug: string;
  title: string;
  format: 'markdown' | 'html';
  body: string;
  updatedAt?: string;
}

export type ManualSyncProgress =
  | {
      type: 'warning';
      message: string;
    }
  | {
      type: 'collection-ready';
      collectionKey: string;
      sourceType: 'local' | 'yuque';
      total: number;
      groups: { name: string; files: number }[];
    }
  | {
      type: 'document';
      status: 'syncing' | 'prepared';
      collectionKey: string;
      sourceType: 'local' | 'yuque';
      index: number;
      total: number;
      group: string;
      slug: string;
      title?: string;
    };

type ManualSyncProgressHandler = (progress: ManualSyncProgress) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unwrapData(value: unknown): unknown {
  return isRecord(value) && 'data' in value ? value['data'] : value;
}

function encodePath(value: string): string {
  return value
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function retryDelay(response: Response, attempt: number): number | undefined {
  const retryAfter = response.headers.get('Retry-After');
  const fallback = Math.min(250 * 2 ** attempt, 1_000);

  if (retryAfter === null) {
    return fallback;
  }
  const seconds = Number(retryAfter);
  const requested = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(retryAfter) - Date.now();

  if (!Number.isFinite(requested)) {
    return fallback;
  }

  return requested > 10_000 ? undefined : Math.max(0, requested);
}

function parseToc(value: unknown, namespace: string): YuqueTocNode[] {
  const raw = unwrapData(value);

  if (!Array.isArray(raw)) {
    throw new Error(`Invalid Yuque TOC response for ${namespace}`);
  }

  function parseNodes(nodes: unknown[]): YuqueTocNode[] {
    return nodes.map((node, index) => {
      if (
        !isRecord(node) ||
        typeof node['type'] !== 'string' ||
        typeof node['title'] !== 'string' ||
        (node['children'] !== undefined && !Array.isArray(node['children'])) ||
        (node['depth'] !== undefined &&
          (typeof node['depth'] !== 'number' ||
            !Number.isInteger(node['depth']) ||
            node['depth'] < 0))
      ) {
        throw new Error(`Invalid Yuque TOC node ${index} for ${namespace}`);
      }
      const docId = node['doc_id'] ?? node['id'];

      return {
        type: node['type'].toUpperCase(),
        title: node['title'],
        ...(typeof node['depth'] === 'number' ? { depth: node['depth'] } : {}),
        ...(typeof node['slug'] === 'string' ? { slug: node['slug'] } : {}),
        ...(typeof docId === 'string' || typeof docId === 'number'
          ? { docId: String(docId) }
          : {}),
        children: Array.isArray(node['children'])
          ? parseNodes(node['children'])
          : [],
      };
    });
  }

  return parseNodes(raw);
}

function parseDocument(value: unknown, expectedSlug: string): YuqueDocument {
  const data = unwrapData(value);

  if (
    !isRecord(data) ||
    typeof data['slug'] !== 'string' ||
    data['slug'] !== expectedSlug ||
    typeof data['title'] !== 'string' ||
    data['title'].trim() === '' ||
    typeof data['format'] !== 'string' ||
    typeof data['body'] !== 'string'
  ) {
    throw new Error(`Invalid Yuque document response for slug ${expectedSlug}`);
  }
  const format = data['format'].toLowerCase();
  let body: string;
  let normalizedFormat: YuqueDocument['format'];

  if (format === 'markdown' || format === 'md') {
    if (
      data['body'].trim() === '' ||
      /<(?:!doctype|html|body)\b/iu.test(data['body'])
    ) {
      throw new Error(`Yuque document is not raw Markdown: ${expectedSlug}`);
    }
    body = data['body'];
    normalizedFormat = 'markdown';
  } else if (format === 'lake') {
    if (
      typeof data['body_html'] !== 'string' ||
      data['body_html'].trim() === ''
    ) {
      throw new Error(`Yuque Lake document has no HTML body: ${expectedSlug}`);
    }
    body = data['body_html'];
    normalizedFormat = 'html';
  } else {
    throw new Error(
      `Unsupported Yuque document format for slug ${expectedSlug}: ${format}`,
    );
  }

  if (normalizedFormat === 'markdown' && !/^#\s+.+$/mu.test(body)) {
    body = `# ${data['title'].replace(/[\r\n]+/gu, ' ').trim()}\n\n${body}`;
  }

  const updatedAt = data['updated_at'] ?? data['updatedAt'];

  return {
    ...(typeof data['id'] === 'string' || typeof data['id'] === 'number'
      ? { id: data['id'] }
      : {}),
    slug: data['slug'],
    title: data['title'],
    format: normalizedFormat,
    body,
    ...(typeof updatedAt === 'string' ? { updatedAt } : {}),
  };
}

function ignored(
  collection: ManualCollectionConfig,
  namespace: string,
  node: YuqueTocNode,
): boolean {
  const rules = collection.ignore;

  return (
    (node.docId !== undefined &&
      rules?.docIds?.includes(node.docId) === true) ||
    (node.slug !== undefined && rules?.slugs?.includes(node.slug) === true) ||
    rules?.titleContains?.some(marker => node.title.includes(marker)) ===
      true ||
    rules?.documentRefs?.some(
      reference =>
        reference.namespace === namespace && reference.slug === node.slug,
    ) === true
  );
}

function safeRouteSlug(prefix: string | undefined, slug: string): string {
  const result = prefix === undefined ? slug : `${prefix}-${slug}`;

  if (!isSafeSlug(result)) {
    throw new Error(`Unsafe manual route slug: ${result}`);
  }

  return result;
}

async function requestJSON(
  url: URL,
  token: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;

    try {
      response = await fetcher(url, {
        headers: { 'X-Auth-Token': token, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      if (attempt === 2) {
        throw new Error(`Yuque request failed for ${url.pathname}`);
      }
      continue;
    }
    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new Error(`Invalid Yuque JSON response for ${url.pathname}`);
      }
    }
    if (attempt < 2 && (response.status === 429 || response.status >= 500)) {
      const delay = retryDelay(response, attempt);

      if (delay === undefined) {
        throw new Error(
          `Yuque request failed (HTTP ${response.status}) for ${url.pathname}`,
        );
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    throw new Error(
      `Yuque request failed (HTTP ${response.status}) for ${url.pathname}`,
    );
  }
  throw new Error(`Yuque request failed for ${url.pathname}`);
}

async function fetchDocument(
  baseURL: string,
  namespace: string,
  slug: string,
  token: string,
  fetcher: typeof fetch,
): Promise<YuqueDocument> {
  const url = new URL(
    `${encodePath(namespace)}/docs/${encodeURIComponent(slug)}?raw=1`,
    `${baseURL.replace(/\/+$/u, '')}/repos/`,
  );

  return parseDocument(await requestJSON(url, token, fetcher), slug);
}

function replaceYuqueDocumentLinks(
  markdown: string,
  routeByDocument: Map<string, string>,
): string {
  const yuqueLinkPattern =
    /https:\/\/(?:[^/\s"'<>]+\.)?yuque\.com\/([^/?#\s"'<>]+\/[^/?#\s"'<>]+)\/([^/?#\s"'<>)]*)(?:\?[^#\s"'<>)]*)?(#[^\s"'<>)]*)?/gu;

  return markdown.replace(
    yuqueLinkPattern,
    (link, namespace: string, slug: string, hash = '') => {
      const routeSlug = routeByDocument.get(`${namespace}/${slug}`);

      return routeSlug === undefined ? link : `../${routeSlug}/${hash}`;
    },
  );
}

function replaceYuqueLinksInPages(pages: ManualPage[]): void {
  const routeByDocument = new Map<string, string>();

  for (const page of pages) {
    const source = page.navigation.source;

    if (source?.type === 'yuque') {
      routeByDocument.set(
        `${source.namespace}/${source.slug}`,
        page.navigation.slug,
      );
    }
  }
  for (const page of pages) {
    if (page.navigation.source?.type !== 'yuque' || page.format !== 'html') {
      continue;
    }
    page.content = replaceYuqueDocumentLinks(page.content, routeByDocument);
  }
}

function addPage(
  pages: ManualPage[],
  slugs: Set<string>,
  page: ManualPage,
): void {
  const folded = page.navigation.slug.toLocaleLowerCase('en-US');

  if (slugs.has(folded)) {
    throw new Error(`Manual route slug collision: ${page.navigation.slug}`);
  }
  slugs.add(folded);
  pages.push(page);
}

function countFilesByGroup(
  groups: string[],
): { name: string; files: number }[] {
  const counts = new Map<string, number>();

  for (const group of groups) {
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  return [...counts].map(([name, files]) => ({ name, files }));
}

async function loadTranslations(
  config: ResolvedDocsBuildConfig,
  document: Pick<TranslationDocument, 'owner' | 'key' | 'sourceLocale' | 'format' | 'content' | 'title' | 'group'>,
): Promise<ManualPage['translations']> {
  const translations: ManualPage['translations'] = {};

  for (const locale of config.locales) {
    if (locale === document.sourceLocale) {
      continue;
    }
    translations[locale] = await readDocumentTranslation(config, { ...document, kind: 'manual' }, locale);
  }

  return translations;
}

function yuqueDocumentKey(namespace: string, slug: string, docId?: string): string {
  return docId === undefined
    ? `source-${encodeURIComponent(namespace)}-${encodeURIComponent(slug)}`
    : `doc-${encodeURIComponent(docId)}`;
}

async function syncYuqueCollection(
  collection: ManualCollectionConfig,
  config: ResolvedDocsBuildConfig,
  fetcher: typeof fetch,
  pages: ManualPage[],
  slugs: Set<string>,
  onProgress?: ManualSyncProgressHandler,
): Promise<number> {
  if (collection.source.type !== 'yuque') {
    return 0;
  }
  const { source } = collection;
  const token = process.env[source.tokenEnv]?.trim();

  if (token === undefined || token.length === 0) {
    throw new Error(
      `Missing Yuque token environment variable: ${source.tokenEnv}`,
    );
  }
  const sourceDocs: {
    namespace: string;
    slug: string;
    routeSlug: string;
    group: string;
    docId?: string;
  }[] = [];

  if (source.mode === 'repo') {
    const namespace = source.namespace;
    const tocURL = new URL(
      `${encodePath(namespace)}/toc`,
      `${source.baseURL.replace(/\/+$/u, '')}/repos/`,
    );
    const toc = parseToc(await requestJSON(tocURL, token, fetcher), namespace);

    if (
      toc.some(node => node.depth !== undefined) &&
      toc.every(node => node.children.length === 0)
    ) {
      const groups: { depth: number; title: string }[] = [];
      let ignoredDepth: number | undefined;

      for (const node of toc) {
        const depth = node.depth ?? 0;

        if (node.type === 'TITLE') {
          const ignoredByParent =
            ignoredDepth !== undefined && depth > ignoredDepth;

          while (
            groups.at(-1)?.depth !== undefined &&
            groups.at(-1)!.depth >= depth
          ) {
            groups.pop();
          }
          if (ignoredByParent) {
            continue;
          }
          if (ignoredDepth !== undefined && depth <= ignoredDepth) {
            ignoredDepth = undefined;
          }
          if (ignored(collection, namespace, node)) {
            ignoredDepth = depth;
            continue;
          }
          groups.push({ depth, title: node.title });
          continue;
        }
        if (
          node.type !== 'DOC' ||
          (ignoredDepth !== undefined && depth > ignoredDepth) ||
          ignored(collection, namespace, node)
        ) {
          continue;
        }
        if (node.slug === undefined) {
          throw new Error(`Yuque TOC document has no slug in ${namespace}`);
        }
        sourceDocs.push({
          namespace,
          slug: node.slug,
          routeSlug: safeRouteSlug(collection.routePrefix, node.slug),
          group: groups
            .filter(group => group.depth < depth)
            .map(group => group.title)
            .join(' / '),
          ...(node.docId === undefined ? {} : { docId: node.docId }),
        });
      }
    } else {
      function visit(nodes: YuqueTocNode[], parentGroups: string[]): void {
        for (const node of nodes) {
          if (ignored(collection, namespace, node)) {
            continue;
          }
          if (node.type === 'DOC') {
            if (node.slug === undefined) {
              throw new Error(`Yuque TOC document has no slug in ${namespace}`);
            }
            sourceDocs.push({
              namespace,
              slug: node.slug,
              routeSlug: safeRouteSlug(collection.routePrefix, node.slug),
              group: parentGroups.join(' / '),
              ...(node.docId === undefined ? {} : { docId: node.docId }),
            });
          } else if (node.children.length > 0) {
            visit(
              node.children,
              node.type === 'TITLE'
                ? [...parentGroups, node.title]
                : parentGroups,
            );
          }
        }
      }

      visit(toc, []);
    }
  } else {
    for (const document of source.documents) {
      const refIgnored =
        (document.docId !== undefined &&
          collection.ignore?.docIds?.includes(document.docId) === true) ||
        collection.ignore?.documentRefs?.some(
          reference =>
            reference.namespace === document.namespace &&
            reference.slug === document.slug,
        ) === true;

      if (!refIgnored) {
        sourceDocs.push({
          namespace: document.namespace,
          slug: document.slug,
          routeSlug: safeRouteSlug(collection.routePrefix, document.routeSlug),
          group: document.group ?? '',
          ...(document.docId === undefined ? {} : { docId: document.docId }),
        });
      }
    }
  }

  onProgress?.({
    type: 'collection-ready',
    collectionKey: collection.key,
    sourceType: 'yuque',
    total: sourceDocs.length,
    groups: countFilesByGroup(sourceDocs.map(sourceDoc => sourceDoc.group)),
  });

  for (const [index, sourceDoc] of sourceDocs.entries()) {
    const documentIndex = index + 1;

    onProgress?.({
      type: 'document',
      status: 'syncing',
      collectionKey: collection.key,
      sourceType: 'yuque',
      index: documentIndex,
      total: sourceDocs.length,
      group: sourceDoc.group,
      slug: sourceDoc.slug,
    });
    const document = await fetchDocument(
      source.baseURL,
      sourceDoc.namespace,
      sourceDoc.slug,
      token,
      fetcher,
    );

    const title = document.title;
    const updatedAt = document.updatedAt;
    const documentId = document.id === undefined
      ? sourceDoc.docId
      : String(document.id);

    if (documentId === undefined) {
      onProgress?.({
        type: 'warning',
        message: `Yuque document ${sourceDoc.namespace}/${sourceDoc.slug} has no docId; its translation archive uses namespace/slug and must be migrated if either changes.`,
      });
    }
    const navigation: ManualNavigationItem = {
      slug: sourceDoc.routeSlug,
      collectionKey: collection.key,
      documentKey: yuqueDocumentKey(sourceDoc.namespace, sourceDoc.slug, documentId),
      sourceLocale: source.locale,
      title: Object.fromEntries(config.locales.map(locale => [locale, title])),
      group: Object.fromEntries(
        config.locales.map(locale => [locale, sourceDoc.group]),
      ),
      format: Object.fromEntries(
        config.locales.map(locale => [locale, document.format]),
      ),
      ...(updatedAt === undefined
        ? {}
        : {
            lastModified: Object.fromEntries(
              config.locales.map(locale => [locale, updatedAt]),
            ),
          }),
      source: {
        type: 'yuque',
        namespace: sourceDoc.namespace,
        slug: sourceDoc.slug,
        ...(documentId === undefined ? {} : { docId: documentId }),
      },
    };

    addPage(pages, slugs, {
      navigation,
      sourceLocale: source.locale,
      content:
        document.format === 'markdown' && !document.body.endsWith('\n')
          ? `${document.body}\n`
          : document.body,
      format: document.format,
      translations: {},
    });
    onProgress?.({
      type: 'document',
      status: 'prepared',
      collectionKey: collection.key,
      sourceType: 'yuque',
      index: documentIndex,
      total: sourceDocs.length,
      group: sourceDoc.group,
      slug: sourceDoc.slug,
      title: document.title,
    });
  }

  return sourceDocs.length;
}

async function syncLocalCollection(
  collection: ManualCollectionConfig,
  config: ResolvedDocsBuildConfig,
  pages: ManualPage[],
  slugs: Set<string>,
  previousHashes: ReadonlyMap<string, string>,
  generatedHashes: Map<string, string>,
  onProgress?: ManualSyncProgressHandler,
): Promise<number> {
  if (collection.source.type !== 'local') {
    return 0;
  }
  const navigationPath = path.join(
    collection.source.directory,
    'navigation.json',
  );

  await assertNoSymlinkPath(config.repositoryRoot, navigationPath);
  const raw: unknown = parseJSON(
    await readFile(navigationPath, 'utf8'),
    navigationPath,
  );

  if (!Array.isArray(raw)) {
    throw new Error(`Invalid local manual navigation: ${navigationPath}`);
  }
  const outputDirectory = config.manualDirectory;
  const readsOutputDirectory =
    path.resolve(collection.source.directory) === path.resolve(outputDirectory);
  const localItems = readsOutputDirectory
    ? raw.filter(
        item =>
          isRecord(item) &&
          isRecord(item['source']) &&
          item['source']['type'] === 'local' &&
          (item['collectionKey'] === undefined || item['collectionKey'] === collection.key),
      )
    : raw;
  const localGroups = localItems.map(item => {
    if (!isRecord(item) || !isRecord(item['group'])) {
      return '';
    }

    return String(item['group'][collection.source.locale] ?? '');
  });

  onProgress?.({
    type: 'collection-ready',
    collectionKey: collection.key,
    sourceType: 'local',
    total: localItems.length,
    groups: countFilesByGroup(localGroups),
  });

  for (const [index, item] of localItems.entries()) {
    if (
      !isRecord(item) ||
      typeof item['slug'] !== 'string' ||
      !isRecord(item['title']) ||
      !isRecord(item['group']) ||
      (item['parent'] !== undefined && typeof item['parent'] !== 'string')
    ) {
      throw new Error(
        `Invalid local manual navigation item: ${navigationPath}`,
      );
    }
    const titles = item['title'];
    const groups = item['group'];
    const inputSlug = item['slug'];
    const slug = readsOutputDirectory && typeof item['documentKey'] === 'string' ? item['documentKey'] : item['slug'];

    if (!isSafeSlug(inputSlug) || !isSafeSlug(slug)) {
      throw new Error(`Unsafe local manual slug in ${navigationPath}`);
    }
    const group = String(groups[collection.source.locale] ?? '');
    const documentIndex = index + 1;

    onProgress?.({
      type: 'document',
      status: 'syncing',
      collectionKey: collection.key,
      sourceType: 'local',
      index: documentIndex,
      total: localItems.length,
      group,
      slug,
    });
    const sourceMarkdownPath = path.join(
      collection.source.directory,
      collection.source.locale,
      `${inputSlug}.md`,
    );

    await assertNoSymlinkPath(config.repositoryRoot, sourceMarkdownPath);
    const markdown = await readFile(sourceMarkdownPath, 'utf8');
    const translations = await loadTranslations(config, {
      owner: collection.key, key: slug, sourceLocale: collection.source.locale,
      format: 'markdown', content: markdown, title: String(titles[collection.source.locale] ?? ''), group,
    });

    const routeSlug = safeRouteSlug(collection.routePrefix, slug);
    const title: Record<string, string> = {};
    const localizedGroup: Record<string, string> = {};

    for (const locale of config.locales) {
      const archive = translations[locale];

      if (locale !== collection.source.locale) {
        const relativePath = `${locale}/${inputSlug}.md`;
        const localizedPath = path.join(collection.source.directory, relativePath);
        const content = await readOptionalText(config.repositoryRoot, localizedPath);
        const maintained = content !== undefined &&
          (!readsOutputDirectory || previousHashes.get(relativePath) !== manualContentHash(content));

        if (maintained) {
          if (content.trim() === '') {
            throw new Error(`Empty maintained manual: ${localizedPath}`);
          }
          if (archive?.content !== undefined && archive.content !== content) {
            onProgress?.({ type: 'warning', message: `${collection.key}/${locale}/${slug}: maintained file differs from archive; using maintained file` });
          }
          translations[locale] = { content, status: 'translated' };
        } else if (readsOutputDirectory) {
          generatedHashes.set(`${locale}/${routeSlug}.md`, manualContentHash(archive?.content ?? markdown));
        }
      }

      for (const field of ['title', 'group'] as const) {
        const values = field === 'title' ? titles : groups;
        const output = field === 'title' ? title : localizedGroup;
        const input = values[locale];
        const inputKey = `navigation.json/${inputSlug}/${locale}/${field}`;

        if (typeof input === 'string' && (!readsOutputDirectory || previousHashes.get(inputKey) !== manualContentHash(input))) {
          output[locale] = input;
        } else {
          const generated = archive?.[field] ?? String(values[collection.source.locale] ?? '');

          output[locale] = generated;
          if (readsOutputDirectory) {
            generatedHashes.set(`navigation.json/${routeSlug}/${locale}/${field}`, manualContentHash(generated));
          }
        }
      }
    }
    const navigation: ManualNavigationItem = {
      slug: routeSlug,
      collectionKey: collection.key,
      documentKey: slug,
      sourceLocale: collection.source.locale,
      title,
      group: localizedGroup,
      ...(typeof item['parent'] === 'string'
        ? {
            parent:
              collection.routePrefix !== undefined &&
              item['parent'].startsWith(`${collection.routePrefix}-`)
                ? safeRouteSlug(undefined, item['parent'])
                : safeRouteSlug(collection.routePrefix, item['parent']),
          }
        : {}),
      format: Object.fromEntries(
        config.locales.map(locale => [locale, 'markdown']),
      ),
      ...(isRecord(item['lastModified'])
        ? { lastModified: item['lastModified'] as Record<string, string> }
        : {}),
      source: { type: 'local' },
    };

    addPage(pages, slugs, {
      navigation,
      sourceLocale: collection.source.locale,
      content: markdown,
      inputSlug,
      format: 'markdown',
      translations,
    });
    onProgress?.({
      type: 'document',
      status: 'prepared',
      collectionKey: collection.key,
      sourceType: 'local',
      index: documentIndex,
      total: localItems.length,
      group,
      slug,
      title: navigation.title[collection.source.locale] ?? slug,
    });
  }

  return localItems.length;
}

async function readManualOverview(
  config: ResolvedDocsBuildConfig,
  locale: string,
): Promise<{ content: Buffer; collectionKey?: string; sourceLocale: string } | undefined> {
  for (const collection of config.manuals ?? []) {
    if (collection.source.type !== 'local') {
      continue;
    }
    const sourcePath = path.join(
      collection.source.directory,
      locale,
      'index.md',
    );

    await assertNoSymlinkPath(config.repositoryRoot, sourcePath);
    try {
      return {
        content: await readFile(sourcePath),
        collectionKey: collection.key,
        sourceLocale: collection.source.locale,
      };
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') {
        throw error;
      }
    }
  }
  const existingPath = path.join(config.manualDirectory, locale, 'index.md');

  await assertNoSymlinkPath(config.repositoryRoot, existingPath);
  try {
    return { content: await readFile(existingPath), sourceLocale: locale };
  } catch (error) {
    if (getErrorCode(error) !== 'ENOENT') {
      throw error;
    }
  }

  return undefined;
}

async function writeManualData(
  config: ResolvedDocsBuildConfig,
  pages: ManualPage[],
  previousHashes: ReadonlyMap<string, string>,
  generatedHashes: Map<string, string>,
): Promise<void> {
  const targetDirectory = config.manualDirectory;
  const temporaryDirectory = path.join(
    path.dirname(targetDirectory),
    `.manual-sync-${process.pid}-${Math.random().toString(16).slice(2)}`,
  );
  const backupDirectory = `${temporaryDirectory}-backup`;

  await assertNoSymlinkPath(config.repositoryRoot, targetDirectory);
  await mkdir(temporaryDirectory, { recursive: true });
  try {
    const navigation = pages.map(page => ({ ...page.navigation,
      contentLocales: Object.fromEntries(config.locales.map(locale => [locale,
        page.translations[locale]?.content === undefined ? page.sourceLocale : locale])),
      translationStatus: Object.fromEntries(config.locales.map(locale => [locale,
        locale === page.sourceLocale ? 'source' : page.translations[locale]?.status ?? 'missing'])),
    }));

    await writeFile(
      path.join(temporaryDirectory, 'navigation.json'),
      `${JSON.stringify(navigation, null, 2)}\n`,
    );
    for (const locale of config.locales) {
      const overview = await readManualOverview(config, locale);

      const messages = getCommonMessages(locale, config.i18n);
      const localeDirectory = path.join(temporaryDirectory, locale);

      await mkdir(localeDirectory, { recursive: true });
      await writeFile(path.join(localeDirectory, 'index.md'),
        overview?.content ?? `# ${messages.manual}\n\n${messages.manualIntro}\n`);
      if (overview !== undefined) {
        // A retained overview also retains its published assets when no source overview remains.
        await copyManualPageAssets(config, overview.collectionKey, undefined, overview.sourceLocale,
          locale, 'markdown', overview.content.toString('utf8'), temporaryDirectory,
          overview.collectionKey === undefined ? new Map<string, string>() : previousHashes, generatedHashes);
      }
    }
    for (const page of pages) {
      for (const locale of config.locales) {
        const content = page.translations[locale]?.content ?? page.content;
        const format = page.format;
        const localeDirectory = path.join(temporaryDirectory, locale);
        const extension = format === 'html' ? 'html' : 'md';

        await mkdir(localeDirectory, { recursive: true });
        await writeFile(
          path.join(localeDirectory, `${page.navigation.slug}.${extension}`),
          content,
        );
        await copyManualPageAssets(config, page.navigation.collectionKey, page.navigation.slug,
          page.sourceLocale, locale, format, content, temporaryDirectory, previousHashes, generatedHashes, page.inputSlug);
      }
    }
    if (generatedHashes.size > 0) {
      await writeFile(path.join(temporaryDirectory, generatedHashesFilename), JSON.stringify(Object.fromEntries(generatedHashes)));
    }
    let existing = false;

    try {
      await lstat(targetDirectory);
      existing = true;
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') {
        throw error;
      }
    }
    if (existing) {
      await rename(targetDirectory, backupDirectory);
    }
    try {
      await rename(temporaryDirectory, targetDirectory);
    } catch (error) {
      if (existing) {
        await rename(backupDirectory, targetDirectory);
      }
      throw error;
    }
    if (existing) {
      await rm(backupDirectory, { recursive: true, force: true });
    }
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function syncManuals(
  config: ResolvedDocsBuildConfig,
  fetcher: typeof fetch = globalThis.fetch,
  onProgress?: ManualSyncProgressHandler,
): Promise<{ collections: number; documents: number }> {
  if (config.manuals === undefined || config.manuals.length === 0) {
    throw new Error('manuals must be configured to run manual sync');
  }
  const pages: ManualPage[] = [];
  const slugs = new Set<string>();
  const previousHashes = await readGeneratedHashes(config.repositoryRoot, config.manualDirectory);
  const generatedHashes = new Map<string, string>();
  let documents = 0;

  for (const collection of config.manuals) {
    documents +=
      (await syncLocalCollection(
        collection,
        config,
        pages,
        slugs,
        previousHashes,
        generatedHashes,
        onProgress,
      )) +
      (await syncYuqueCollection(
        collection,
        config,
        fetcher,
        pages,
        slugs,
        onProgress,
      ));
  }
  replaceYuqueLinksInPages(pages);
  // Extraction reads the published HTML, including rewritten inter-document links.
  for (const page of pages) {
    const { navigation, sourceLocale } = page;

    if (navigation.source?.type !== 'yuque') {
      continue;
    }
    page.translations = await loadTranslations(config, {
      owner: navigation.collectionKey, key: navigation.documentKey, sourceLocale,
      format: page.format, content: page.content,
      title: navigation.title[sourceLocale]!, group: navigation.group[sourceLocale]!,
    });
    for (const [locale, translation] of Object.entries(page.translations)) {
      navigation.title[locale] = translation.title ?? navigation.title[sourceLocale]!;
      navigation.group[locale] = translation.group ?? navigation.group[sourceLocale]!;
    }
  }
  await writeManualData(config, pages, previousHashes, generatedHashes);

  return { collections: config.manuals.length, documents };
}
