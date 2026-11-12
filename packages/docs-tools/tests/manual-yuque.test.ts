import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test, vi } from 'vitest';
import { loadSiteConfig, syncManuals } from '@galacean/docs-tools';

const execFileAsync = promisify(execFile);

async function fixture(t: {
  onTestFinished: (callback: () => void | Promise<void>) => void;
}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-manual-yuque-'));

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));

  return root;
}

async function loadConfig(
  root: string,
  collections: unknown[],
  manualDataDirectory = 'site/public/data/manual',
) {
  const filename = path.join(root, 'site.config.json');

  await writeFile(
    filename,
    JSON.stringify({
      sourceLocale: 'zh-CN',
      locales: ['zh-CN', 'en'],
      api: { dataDirectory: 'site/public/data/api' },
      manual: { dataDirectory: manualDataDirectory, collections },
    }),
  );

  return loadSiteConfig(path.basename(filename), root);
}

function yuqueDocument(slug: string, title: string) {
  return Response.json({
    data: {
      id: 101,
      slug,
      title,
      format: 'markdown',
      body: `# ${title}\n\nMarkdown body for ${slug}.\n`,
      updated_at: '2026-11-10T00:00:00Z',
    },
  });
}

function yuqueLakeDocument(slug: string, title: string) {
  return Response.json({
    data: {
      id: 102,
      slug,
      title,
      format: 'lake',
      body: '{"type":"doc"}',
      body_html:
        '<div><p>Overview text.</p><ul><li>First item</li><li>Second item</li></ul><table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>One</td><td>Two</td></tr></tbody></table></div>',
    },
  });
}

test('repo sync filters ignored TOC subtrees and documents before fetching bodies', async t => {
  const root = await fixture(t);
  const tokenBefore = process.env['YUQUE_TEST_TOKEN'];

  process.env['YUQUE_TEST_TOKEN'] = 'test-secret-token';
  t.onTestFinished(() => {
    if (tokenBefore === undefined) {
      delete process.env['YUQUE_TEST_TOKEN'];
    } else {
      process.env['YUQUE_TEST_TOKEN'] = tokenBefore;
    }
  });
  const config = await loadConfig(
    root,
    [
      {
        key: 'guide',
        routePrefix: 'product',
        source: {
          type: 'yuque',
          mode: 'repo',
          baseURL: 'https://yuque.internal/api/v2',
          namespace: 'team/book',
          tokenEnv: 'YUQUE_TEST_TOKEN',
          locale: 'zh-CN',
        },
        ignore: { titleContains: ['[private]'], docIds: ['2'] },
      },
    ],
    'site/manual-output',
  );
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));

      assert.equal(
        new Headers(init?.headers).get('X-Auth-Token'),
        'test-secret-token',
      );
      if (url.pathname.endsWith('/toc')) {
        return Response.json({
          data: [
            {
              type: 'TITLE',
              title: '[private] archive',
              children: [
                { type: 'DOC', title: 'Hidden', slug: 'hidden', doc_id: 1 },
              ],
            },
            {
              type: 'TITLE',
              title: 'Guide',
              children: [
                { type: 'DOC', title: 'Start', slug: 'start', doc_id: 3 },
                { type: 'DOC', title: 'Draft', slug: 'draft', doc_id: 2 },
              ],
            },
          ],
        });
      }
      assert.ok(url.pathname.endsWith('/docs/start'));

      return yuqueDocument('start', 'Start');
    },
  );
  const progress: unknown[] = [];

  const result = await syncManuals(config, fetcher, event =>
    progress.push(event),
  );
  const navigation = JSON.parse(
    await readFile(
      path.join(config.manualDirectory, 'navigation.json'),
      'utf8',
    ),
  ) as {
    slug: string;
    title: Record<string, string>;
    group: Record<string, string>;
  }[];

  assert.deepEqual(result, { collections: 1, documents: 1 });
  assert.deepEqual(progress, [
    {
      type: 'collection-ready',
      collectionKey: 'guide',
      sourceType: 'yuque',
      total: 1,
      groups: [{ name: 'Guide', files: 1 }],
    },
    {
      type: 'document',
      status: 'syncing',
      collectionKey: 'guide',
      sourceType: 'yuque',
      index: 1,
      total: 1,
      group: 'Guide',
      slug: 'start',
    },
    {
      type: 'document',
      status: 'prepared',
      collectionKey: 'guide',
      sourceType: 'yuque',
      index: 1,
      total: 1,
      group: 'Guide',
      slug: 'start',
      title: 'Start',
    },
  ]);
  assert.deepEqual(
    fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname),
    ['/api/v2/repos/team/book/toc', '/api/v2/repos/team/book/docs/start'],
  );
  assert.deepEqual(navigation, [
    {
      slug: 'product-start',
      title: { 'zh-CN': 'Start', en: 'Start' },
      group: { 'zh-CN': 'Guide', en: 'Guide' },
      format: { 'zh-CN': 'markdown', en: 'markdown' },
      lastModified: {
        'zh-CN': '2026-11-10T00:00:00Z',
        en: '2026-11-10T00:00:00Z',
      },
      source: {
        type: 'yuque',
        namespace: 'team/book',
        slug: 'start',
        docId: '101',
      },
    },
  ]);
  assert.equal(
    await readFile(
      path.join(config.manualDirectory, 'zh-CN/product-start.md'),
      'utf8',
    ),
    '# Start\n\nMarkdown body for start.\n',
  );
  assert.equal(
    (
      await readFile(
        path.join(config.manualDirectory, 'navigation.json'),
        'utf8',
      )
    ).includes('test-secret-token'),
    false,
  );
});

test('flat TOC depth assigns groups and excludes marked sections before fetching', async t => {
  const root = await fixture(t);
  const tokenBefore = process.env['YUQUE_TEST_TOKEN'];

  process.env['YUQUE_TEST_TOKEN'] = 'test-secret-token';
  t.onTestFinished(() => {
    if (tokenBefore === undefined) {
      delete process.env['YUQUE_TEST_TOKEN'];
    } else {
      process.env['YUQUE_TEST_TOKEN'] = tokenBefore;
    }
  });
  const config = await loadConfig(root, [
    {
      key: 'guide',
      source: {
        type: 'yuque',
        mode: 'repo',
        baseURL: 'https://yuque.internal/api/v2',
        namespace: 'team/book',
        tokenEnv: 'YUQUE_TEST_TOKEN',
        locale: 'zh-CN',
      },
      ignore: { titleContains: ['【已设置私密】'] },
    },
  ]);
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));

    if (url.pathname.endsWith('/toc')) {
      return Response.json({
        data: [
          { type: 'TITLE', title: 'Basics', depth: 1 },
          { type: 'DOC', title: 'First', slug: 'first', doc_id: 1, depth: 2 },
          { type: 'TITLE', title: '【已设置私密】Internal', depth: 1 },
          { type: 'DOC', title: 'Hidden', slug: 'hidden', doc_id: 2, depth: 2 },
          { type: 'TITLE', title: 'Advanced', depth: 1 },
          { type: 'DOC', title: 'Second', slug: 'second', doc_id: 3, depth: 2 },
        ],
      });
    }
    const slug = url.pathname.split('/').at(-1) ?? '';

    return yuqueDocument(slug, slug);
  });

  await syncManuals(config, fetcher);

  const navigation = JSON.parse(
    await readFile(
      path.join(config.manualDirectory, 'navigation.json'),
      'utf8',
    ),
  ) as { slug: string; group: Record<string, string> }[];

  assert.deepEqual(
    fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname),
    [
      '/api/v2/repos/team/book/toc',
      '/api/v2/repos/team/book/docs/first',
      '/api/v2/repos/team/book/docs/second',
    ],
  );
  assert.deepEqual(
    navigation.map(item => item.slug),
    ['first', 'second'],
  );
  assert.deepEqual(
    navigation.map(item => item.group['zh-CN']),
    ['Basics', 'Advanced'],
  );
});

test('documents mode requests only allowed references in configured order', async t => {
  const root = await fixture(t);
  const tokenBefore = process.env['YUQUE_TEST_TOKEN'];

  process.env['YUQUE_TEST_TOKEN'] = 'test-token';
  t.onTestFinished(() => {
    if (tokenBefore === undefined) {
      delete process.env['YUQUE_TEST_TOKEN'];
    } else {
      process.env['YUQUE_TEST_TOKEN'] = tokenBefore;
    }
  });
  const config = await loadConfig(root, [
    {
      key: 'selected',
      source: {
        type: 'yuque',
        mode: 'documents',
        baseURL: 'https://www.yuque.com/api/v2',
        tokenEnv: 'YUQUE_TEST_TOKEN',
        locale: 'zh-CN',
        documents: [
          {
            namespace: 'team/one',
            slug: 'first',
            routeSlug: 'first',
            group: 'A',
          },
          {
            namespace: 'team/two',
            slug: 'excluded',
            routeSlug: 'excluded',
            docId: '7',
          },
          {
            namespace: 'team/three',
            slug: 'last',
            routeSlug: 'last',
            group: 'B',
          },
        ],
      },
      ignore: { docIds: ['7'] },
    },
  ]);
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));

    assert.ok(!url.pathname.endsWith('/toc'));
    const slug = url.pathname.split('/').at(-1);

    return yuqueDocument(slug ?? '', slug ?? '');
  });

  const result = await syncManuals(config, fetcher);
  const navigation = JSON.parse(
    await readFile(
      path.join(config.manualDirectory, 'navigation.json'),
      'utf8',
    ),
  ) as { slug: string; group: Record<string, string> }[];

  assert.deepEqual(result, { collections: 1, documents: 2 });
  assert.deepEqual(
    fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname),
    ['/api/v2/repos/team/one/docs/first', '/api/v2/repos/team/three/docs/last'],
  );
  assert.deepEqual(
    navigation.map(item => item.slug),
    ['first', 'last'],
  );
  assert.deepEqual(
    navigation.map(item => item.group['zh-CN']),
    ['A', 'B'],
  );
});

test('retries a rate-limited request according to Retry-After', async t => {
  const root = await fixture(t);
  const tokenBefore = process.env['YUQUE_TEST_TOKEN'];

  process.env['YUQUE_TEST_TOKEN'] = 'test-token';
  t.onTestFinished(() => {
    if (tokenBefore === undefined) {
      delete process.env['YUQUE_TEST_TOKEN'];
    } else {
      process.env['YUQUE_TEST_TOKEN'] = tokenBefore;
    }
  });
  const config = await loadConfig(root, [
    {
      key: 'selected',
      source: {
        type: 'yuque',
        mode: 'documents',
        baseURL: 'https://www.yuque.com/api/v2',
        tokenEnv: 'YUQUE_TEST_TOKEN',
        locale: 'zh-CN',
        documents: [
          { namespace: 'team/book', slug: 'article', routeSlug: 'article' },
        ],
      },
    },
  ]);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('', { status: 429, headers: { 'Retry-After': '0' } }),
    )
    .mockResolvedValueOnce(yuqueDocument('article', 'Article'));

  await syncManuals(config, fetcher);

  assert.equal(fetcher.mock.calls.length, 2);
});

test('preserves Yuque Lake HTML in an HTML artifact', async t => {
  const root = await fixture(t);
  const tokenBefore = process.env['YUQUE_TEST_TOKEN'];

  process.env['YUQUE_TEST_TOKEN'] = 'test-token';
  t.onTestFinished(() => {
    if (tokenBefore === undefined) {
      delete process.env['YUQUE_TEST_TOKEN'];
    } else {
      process.env['YUQUE_TEST_TOKEN'] = tokenBefore;
    }
  });
  const config = await loadConfig(root, [
    {
      key: 'lake-guide',
      source: {
        type: 'yuque',
        mode: 'documents',
        baseURL: 'https://yuque.internal/api/v2',
        tokenEnv: 'YUQUE_TEST_TOKEN',
        locale: 'zh-CN',
        documents: [
          {
            namespace: 'team/book',
            slug: 'lake-guide',
            routeSlug: 'lake-guide',
          },
        ],
      },
    },
  ]);
  const fetcher = vi.fn(async () =>
    yuqueLakeDocument('lake-guide', 'Lake guide'),
  );

  await syncManuals(config, fetcher);

  const html = await readFile(
    path.join(config.manualDirectory, 'zh-CN/lake-guide.html'),
    'utf8',
  );

  assert.equal(
    html,
    '<div><p>Overview text.</p><ul><li>First item</li><li>Second item</li></ul><table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>One</td><td>Two</td></tr></tbody></table></div>',
  );
});

test('failed remote sync leaves existing manual data untouched', async t => {
  const root = await fixture(t);
  const tokenBefore = process.env['YUQUE_TEST_TOKEN'];

  process.env['YUQUE_TEST_TOKEN'] = 'test-token';
  t.onTestFinished(() => {
    if (tokenBefore === undefined) {
      delete process.env['YUQUE_TEST_TOKEN'];
    } else {
      process.env['YUQUE_TEST_TOKEN'] = tokenBefore;
    }
  });
  const config = await loadConfig(root, [
    {
      key: 'guide',
      source: {
        type: 'yuque',
        mode: 'repo',
        baseURL: 'https://yuque.internal/api/v2',
        namespace: 'team/book',
        tokenEnv: 'YUQUE_TEST_TOKEN',
        locale: 'zh-CN',
      },
    },
  ]);
  const manualDirectory = path.join(config.manualDirectory);

  await mkdir(manualDirectory, { recursive: true });
  await writeFile(
    path.join(manualDirectory, 'navigation.json'),
    '[{"slug":"old"}]\n',
  );
  const fetcher = vi.fn(
    async () => new Response('unavailable', { status: 503 }),
  );

  await assert.rejects(syncManuals(config, fetcher), /HTTP 503/u);
  assert.equal(
    await readFile(path.join(manualDirectory, 'navigation.json'), 'utf8'),
    '[{"slug":"old"}]\n',
  );
});

test('local collections retain translations, localized navigation, and overview files', async t => {
  const root = await fixture(t);
  const localDirectory = path.join(root, 'site/manual-local');
  const translationDirectory = path.join(root, 'site/translations/en');
  const config = await loadConfig(root, [
    {
      key: 'local-guide',
      source: {
        type: 'local',
        directory: 'site/manual-local',
        locale: 'zh-CN',
      },
      translations: { en: 'site/translations/en' },
    },
  ]);

  await mkdir(path.join(localDirectory, 'zh-CN'), { recursive: true });
  await mkdir(translationDirectory, { recursive: true });
  await mkdir(path.join(config.manualDirectory, 'zh-CN'), {
    recursive: true,
  });
  await mkdir(path.join(config.manualDirectory, 'en'), {
    recursive: true,
  });
  await writeFile(
    path.join(localDirectory, 'navigation.json'),
    JSON.stringify([
      {
        slug: 'getting-started',
        title: { 'zh-CN': '开始使用' },
        group: { 'zh-CN': '指南' },
        parent: 'getting-started-parent',
      },
    ]),
  );
  await writeFile(
    path.join(localDirectory, 'zh-CN/getting-started.md'),
    '# 开始使用\n\n中文正文。\n',
  );
  await writeFile(
    path.join(translationDirectory, 'getting-started.md'),
    '# Getting started\n\nEnglish body.\n',
  );
  await writeFile(
    path.join(translationDirectory, 'navigation.json'),
    JSON.stringify({
      'getting-started': { title: 'Getting started', group: 'Guides' },
    }),
  );
  await writeFile(
    path.join(config.manualDirectory, 'zh-CN/index.md'),
    '# 中文手册\n',
  );
  await writeFile(
    path.join(config.manualDirectory, 'en/index.md'),
    '# English manuals\n',
  );

  const result = await syncManuals(config);
  const output = config.manualDirectory;
  const navigation = JSON.parse(
    await readFile(path.join(output, 'navigation.json'), 'utf8'),
  ) as {
    title: Record<string, string>;
    group: Record<string, string>;
    parent?: string;
  }[];

  assert.deepEqual(result, { collections: 1, documents: 1 });
  assert.equal(
    await readFile(path.join(output, 'en/getting-started.md'), 'utf8'),
    '# Getting started\n\nEnglish body.\n',
  );
  assert.equal(navigation[0]?.title['en'], 'Getting started');
  assert.equal(navigation[0]?.group['en'], 'Guides');
  assert.equal(navigation[0]?.parent, 'getting-started-parent');
  assert.equal(
    await readFile(path.join(output, 'zh-CN/index.md'), 'utf8'),
    '# 中文手册\n',
  );
  assert.equal(
    await readFile(path.join(output, 'en/index.md'), 'utf8'),
    '# English manuals\n',
  );
});

test('shared manual output directory imports only entries marked as local', async t => {
  const root = await fixture(t);
  const config = await loadConfig(root, [
    {
      key: 'local-guides',
      source: {
        type: 'local',
        directory: 'site/public/data/manual',
        locale: 'zh-CN',
      },
    },
  ]);
  const manualDirectory = path.join(config.manualDirectory);

  await mkdir(path.join(manualDirectory, 'zh-CN'), { recursive: true });
  await writeFile(
    path.join(manualDirectory, 'navigation.json'),
    JSON.stringify([
      {
        slug: 'remote-page',
        title: { 'zh-CN': 'Remote' },
        group: { 'zh-CN': 'Guides' },
        source: { type: 'yuque', namespace: 'team/book', slug: 'remote-page' },
      },
      {
        slug: 'local-page',
        title: { 'zh-CN': 'Local' },
        group: { 'zh-CN': 'Guides' },
        source: { type: 'local' },
      },
    ]),
  );
  await writeFile(
    path.join(manualDirectory, 'zh-CN/remote-page.md'),
    '# Remote\n\nRemote page content.\n',
  );
  await writeFile(
    path.join(manualDirectory, 'zh-CN/local-page.md'),
    '# Local\n\nLocal page content.\n',
  );

  const result = await syncManuals(config);
  const navigation = JSON.parse(
    await readFile(path.join(manualDirectory, 'navigation.json'), 'utf8'),
  ) as { slug: string; source?: { type: string } }[];

  assert.deepEqual(result, { collections: 1, documents: 1 });
  assert.deepEqual(navigation, [
    {
      slug: 'local-page',
      title: { 'zh-CN': 'Local', en: 'Local' },
      group: { 'zh-CN': 'Guides', en: 'Guides' },
      format: { 'zh-CN': 'markdown', en: 'markdown' },
      source: { type: 'local' },
    },
  ]);
});

test('manual sync CLI prints file totals, group counts, and per-file states', async t => {
  const root = await fixture(t);
  const config = await loadConfig(root, [
    {
      key: 'local-guides',
      source: {
        type: 'local',
        directory: 'site/manual-local',
        locale: 'zh-CN',
      },
    },
  ]);
  const localDirectory = path.join(root, 'site/manual-local');
  const cliPath = path.resolve(import.meta.dirname, '../bin/galacean-docs.mjs');

  await mkdir(path.join(localDirectory, 'zh-CN'), { recursive: true });
  await mkdir(path.join(localDirectory, 'en'), { recursive: true });
  await writeFile(
    path.join(localDirectory, 'navigation.json'),
    JSON.stringify([
      {
        slug: 'getting-started',
        title: { 'zh-CN': '开始使用', en: 'Getting started' },
        group: { 'zh-CN': '指南', en: 'Guides' },
      },
    ]),
  );
  await writeFile(
    path.join(localDirectory, 'zh-CN/getting-started.md'),
    '# 开始使用\n\n本地手册。\n',
  );
  await writeFile(
    path.join(localDirectory, 'en/getting-started.md'),
    '# Getting started\n\nLocal manual.\n',
  );

  const result = await execFileAsync(
    process.execPath,
    [cliPath, 'manual', 'sync', '--config', path.basename(config.configPath)],
    { cwd: root, env: { ...process.env, NO_COLOR: '1' } },
  );

  assert.match(
    result.stdout,
    /\[docs-tools\]\[manual sync\]\[INFO\] Collection local-guides \(local\): 1 files queued/u,
  );
  assert.match(
    result.stdout,
    /\[docs-tools\]\[manual sync\]\[INFO\] Group 指南: 1 files/u,
  );
  assert.match(
    result.stdout,
    /\[docs-tools\]\[manual sync\]\[INFO\] \[1\/1\] Syncing: 指南 \/ getting-started/u,
  );
  assert.match(
    result.stdout,
    /\[docs-tools\]\[manual sync\]\[SUCCESS\] \[1\/1\] Prepared: 指南 \/ 开始使用/u,
  );
  assert.match(
    result.stdout,
    /\[docs-tools\]\[manual sync\]\[SUCCESS\] Complete: 1 files across 1 collections/u,
  );
});
