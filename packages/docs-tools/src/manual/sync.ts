import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { assertNoSymlinkPath } from '../config/site-config';
import type {
  DocsSiteConfig,
  ManualCollectionConfig,
} from '../config/site-config';
import { isSafeSlug } from '../config/validation';
import { parseJSON } from '../api/read-json';

interface ManualNavigationItem {
  slug: string;
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
  navigation: ManualNavigationItem;
  sourceLocale: string;
  content: string;
  format: 'markdown' | 'html';
  translations: Record<
    string,
    { markdown: string; title?: string; group?: string }
  >;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
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

async function loadTranslations(
  collection: ManualCollectionConfig,
  slug: string,
  repositoryRoot: string,
): Promise<ManualPage['translations']> {
  const translations: ManualPage['translations'] = {};

  for (const [locale, directory] of Object.entries(
    collection.translations ?? {},
  )) {
    const markdownPath = path.join(directory, `${slug}.md`);

    try {
      await assertNoSymlinkPath(repositoryRoot, markdownPath);
      const markdown = await readFile(markdownPath, 'utf8');

      if (markdown.trim() === '') {
        throw new Error(`Empty manual translation: ${markdownPath}`);
      }
      translations[locale] = { markdown };
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        throw error;
      }
    }
    const metadataPath = path.join(directory, 'navigation.json');

    try {
      await assertNoSymlinkPath(repositoryRoot, metadataPath);
      const metadata: unknown = parseJSON(
        await readFile(metadataPath, 'utf8'),
        metadataPath,
      );
      const localized = isRecord(metadata) ? metadata[slug] : undefined;

      if (isRecord(localized)) {
        const translation = translations[locale] ?? { markdown: '' };

        if (typeof localized['title'] === 'string') {
          translation.title = localized['title'];
        }
        if (typeof localized['group'] === 'string') {
          translation.group = localized['group'];
        }
        translations[locale] = translation;
      }
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        throw error;
      }
    }
  }

  return translations;
}

async function syncYuqueCollection(
  collection: ManualCollectionConfig,
  config: DocsSiteConfig,
  fetcher: typeof fetch,
  pages: ManualPage[],
  slugs: Set<string>,
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

  for (const sourceDoc of sourceDocs) {
    const document = await fetchDocument(
      source.baseURL,
      sourceDoc.namespace,
      sourceDoc.slug,
      token,
      fetcher,
    );

    const title = document.title;
    const updatedAt = document.updatedAt;
    const navigation: ManualNavigationItem = {
      slug: sourceDoc.routeSlug,
      title: Object.fromEntries(
        config.locales.map(locale => [locale, title]),
      ),
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
        ...(document.id === undefined
          ? sourceDoc.docId === undefined
            ? {}
            : { docId: sourceDoc.docId }
          : { docId: String(document.id) }),
      },
    };

    const translations = await loadTranslations(
      collection,
      sourceDoc.routeSlug,
      config.repositoryRoot,
    );

    for (const locale of config.locales) {
      const translation = translations[locale];

      navigation.format![locale] =
        translation?.markdown !== undefined && translation.markdown.length > 0
          ? 'markdown'
          : document.format;
    }
    for (const [locale, translation] of Object.entries(translations)) {
      if (translation.title !== undefined) {
        navigation.title[locale] = translation.title;
      }
      if (translation.group !== undefined) {
        navigation.group[locale] = translation.group;
      }
    }
    addPage(pages, slugs, {
      navigation,
      sourceLocale: source.locale,
      content:
        document.format === 'markdown' && !document.body.endsWith('\n')
          ? `${document.body}\n`
          : document.body,
      format: document.format,
      translations,
    });
  }

  return sourceDocs.length;
}

async function syncLocalCollection(
  collection: ManualCollectionConfig,
  config: DocsSiteConfig,
  pages: ManualPage[],
  slugs: Set<string>,
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
  const outputDirectory = path.join(
    path.dirname(config.apiDirectory),
    'manual',
  );
  const readsOutputDirectory =
    path.resolve(collection.source.directory) === path.resolve(outputDirectory);
  const localItems = readsOutputDirectory
    ? raw.filter(
        item =>
          isRecord(item) &&
          isRecord(item['source']) &&
          item['source']['type'] === 'local',
      )
    : raw;

  for (const item of localItems) {
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
    const slug = item['slug'];

    if (!isSafeSlug(slug)) {
      throw new Error(`Unsafe local manual slug in ${navigationPath}`);
    }
    const sourceMarkdownPath = path.join(
      collection.source.directory,
      collection.source.locale,
      `${slug}.md`,
    );

    await assertNoSymlinkPath(config.repositoryRoot, sourceMarkdownPath);
    const markdown = await readFile(sourceMarkdownPath, 'utf8');
    const navigation: ManualNavigationItem = {
      slug: safeRouteSlug(collection.routePrefix, slug),
      title: Object.fromEntries(
        config.locales.map(locale => [
          locale,
          typeof titles[locale] === 'string'
            ? titles[locale]
            : String(titles[collection.source.locale] ?? ''),
        ]),
      ),
      group: Object.fromEntries(
        config.locales.map(locale => [
          locale,
          typeof groups[locale] === 'string'
            ? groups[locale]
            : String(groups[collection.source.locale] ?? ''),
        ]),
      ),
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
    const translations = await loadTranslations(
      collection,
      navigation.slug,
      config.repositoryRoot,
    );

    for (const [locale, translation] of Object.entries(translations)) {
      if (translation.title !== undefined) {
        navigation.title[locale] = translation.title;
      }
      if (translation.group !== undefined) {
        navigation.group[locale] = translation.group;
      }
    }

    for (const locale of config.locales) {
      if (
        locale === collection.source.locale ||
        translations[locale]?.markdown !== undefined
      ) {
        continue;
      }
      try {
        const translationPath = path.join(
          collection.source.directory,
          locale,
          `${slug}.md`,
        );

        await assertNoSymlinkPath(config.repositoryRoot, translationPath);
        translations[locale] = {
          ...translations[locale],
          markdown: await readFile(translationPath, 'utf8'),
        };
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') {
          throw error;
        }
      }
    }
    addPage(pages, slugs, {
      navigation,
      sourceLocale: collection.source.locale,
      content: markdown,
      format: 'markdown',
      translations,
    });
  }

  return localItems.length;
}

async function writeManualData(
  config: DocsSiteConfig,
  pages: ManualPage[],
): Promise<void> {
  const dataRoot = path.dirname(config.apiDirectory);
  const targetDirectory = path.join(dataRoot, 'manual');
  const temporaryDirectory = path.join(
    dataRoot,
    `.manual-sync-${process.pid}-${Math.random().toString(16).slice(2)}`,
  );
  const backupDirectory = `${temporaryDirectory}-backup`;

  await assertNoSymlinkPath(config.repositoryRoot, targetDirectory);
  await mkdir(temporaryDirectory, { recursive: true });
  try {
    const navigation = pages.map(page => page.navigation);

    await writeFile(
      path.join(temporaryDirectory, 'navigation.json'),
      `${JSON.stringify(navigation, null, 2)}\n`,
    );
    for (const locale of config.locales) {
      const overviewPath = path.join(targetDirectory, locale, 'index.md');

      try {
        await assertNoSymlinkPath(config.repositoryRoot, overviewPath);
        const overview = await readFile(overviewPath);
        const localeDirectory = path.join(temporaryDirectory, locale);

        await mkdir(localeDirectory, { recursive: true });
        await writeFile(path.join(localeDirectory, 'index.md'), overview);
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') {
          throw error;
        }
      }
    }
    for (const page of pages) {
      for (const locale of config.locales) {
        const translation = page.translations[locale];
        const hasTranslation =
          translation?.markdown !== undefined &&
          translation.markdown.length > 0;
        const format =
          locale !== page.sourceLocale && hasTranslation
            ? 'markdown'
            : page.format;
        const content =
          locale === page.sourceLocale
            ? page.content
            : hasTranslation
              ? translation.markdown
              : page.content;
        const localeDirectory = path.join(temporaryDirectory, locale);
        const extension = format === 'html' ? 'html' : 'md';

        await mkdir(localeDirectory, { recursive: true });
        await writeFile(
          path.join(localeDirectory, `${page.navigation.slug}.${extension}`),
          content,
        );
      }
    }
    let existing = false;

    try {
      await lstat(targetDirectory);
      existing = true;
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
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
  config: DocsSiteConfig,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<{ collections: number; documents: number }> {
  if (config.manuals === undefined || config.manuals.length === 0) {
    throw new Error('manuals must be configured to run manual sync');
  }
  const pages: ManualPage[] = [];
  const slugs = new Set<string>();
  let documents = 0;

  for (const collection of config.manuals) {
    documents +=
      (await syncLocalCollection(collection, config, pages, slugs)) +
      (await syncYuqueCollection(collection, config, fetcher, pages, slugs));
  }
  await writeManualData(config, pages);

  return { collections: config.manuals.length, documents };
}
