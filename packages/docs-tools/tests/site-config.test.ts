import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { loadSiteConfig } from '@galacean/docs-tools';

void test('loads TypeScript site config and resolves configured paths from repository root', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-site-config-'));

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'site'));
  await writeFile(
    path.join(root, 'site/site.config.ts'),
    `export default {
    sourceLocale: 'zh-CN',
    locales: ['zh-CN', 'en'],
    api: { dataDirectory: 'site/public/data/api' },
    manual: { dataDirectory: 'site/generated/manual' },
    pages: [
      { slug: null },
      {
        slug: 'custom-page',
        title: { en: 'Custom page', 'zh-CN': '自定义页面' },
        icon: 'source',
      },
    ],
    translationDirectory: 'tmp/docs-tools',
  } satisfies Record<string, unknown>;\n`,
  );

  const config = await loadSiteConfig('site/site.config.ts', root);

  assert.equal(config.sourceLocale, 'zh-CN');
  assert.deepEqual(config.locales, ['zh-CN', 'en']);
  assert.deepEqual(config.pages, [
    { slug: null },
    {
      slug: 'custom-page',
      title: { 'zh-CN': '自定义页面', en: 'Custom page' },
      icon: 'source',
    },
  ]);
  assert.equal(
    config.apiDirectory,
    path.join(config.repositoryRoot, 'site/public/data/api'),
  );
  assert.equal(
    config.manualDirectory,
    path.join(config.repositoryRoot, 'site/generated/manual'),
  );
  assert.equal(
    config.translationDirectory,
    path.join(config.repositoryRoot, 'tmp/docs-tools'),
  );
  assert.equal(
    config.apiTranslationDirectory,
    path.join(config.repositoryRoot, 'tmp/docs-tools/api-translation'),
  );
  assert.equal(
    config.translationCacheDirectory,
    path.join(config.repositoryRoot, 'tmp/docs-tools/translation-cache'),
  );
});

void test('loads site config without API configuration', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-site-config-'));

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en'],
      manual: { dataDirectory: 'site/public/data/manual' },
    }),
  );

  const config = await loadSiteConfig('site.config.json', root);

  assert.equal(config.apiConfigured, false);
  assert.equal(
    config.apiDirectory,
    path.join(config.repositoryRoot, 'site/public/data/api'),
  );
  assert.equal(
    config.manualDirectory,
    path.join(config.repositoryRoot, 'site/public/data/manual'),
  );
});

void test('loads API-only config without a manual directory', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-site-config-'));

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en'],
      api: { dataDirectory: 'site/public/data/api' },
    }),
  );

  const config = await loadSiteConfig('site.config.json', root);

  assert.equal(config.apiConfigured, true);
  assert.equal(config.manualConfigured, false);
  assert.equal(
    config.manualDirectory,
    path.join(config.repositoryRoot, 'site/public/data/manual'),
  );
});

void test('loads inline api.versions configuration', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-site-config-'));

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en'],
      api: {
        dataDirectory: 'site/data/api',
        repository: 'https://github.com/example/project.git',
        versions: ['1.2.3', '1.2.4'],
      },
    }),
  );

  const config = await loadSiteConfig('site.config.json', root);

  assert.deepEqual(config.apiVersions, {
    repository: 'https://github.com/example/project.git',
    versions: ['1.2.3', '1.2.4'],
  });
});

void test('loads the shared translation and CDN config and rejects legacy fields', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-site-config-'));

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en', 'zh-CN'],
      api: {
        dataDirectory: 'site/data/api',
        generation: { scope: 'latest' },
      },
      manual: { dataDirectory: 'site/data/manual' },
      translationDirectory: 'tmp/docs-tools',
      cdn: { baseUrl: 'https://cdn.example.com/docs/' },
    }),
  );

  const config = await loadSiteConfig('site.config.json', root);

  assert.equal(
    config.translationDirectory,
    path.join(config.repositoryRoot, 'tmp/docs-tools'),
  );
  assert.equal(
    config.apiTranslationDirectory,
    path.join(config.repositoryRoot, 'tmp/docs-tools/api-translation'),
  );
  assert.equal(
    config.translationCacheDirectory,
    path.join(config.repositoryRoot, 'tmp/docs-tools/translation-cache'),
  );
  assert.equal(config.cdnBaseUrl, 'https://cdn.example.com/docs/');

  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en'],
      translationWorkDirectory: 'tmp/old',
      cdn: { baseUrl: 'file:///tmp/docs' },
    }),
  );

  await assert.rejects(
    loadSiteConfig('site.config.json', root),
    /translationWorkDirectory is no longer supported.*cdn\.baseUrl/u,
  );
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en'],
      api: { dataDirectory: 'site/data/api', generation: { scope: 'all' } },
    }),
  );
  await assert.rejects(
    loadSiteConfig('site.config.json', root),
    /api\.generation\.scope must be latest/u,
  );
});

void test('loads config without API or manual directories', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-site-config-'));

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({ sourceLocale: 'en', locales: ['en'] }),
  );

  const config = await loadSiteConfig('site.config.json', root);

  assert.equal(config.apiConfigured, false);
  assert.equal(config.manualConfigured, false);
  assert.equal(
    config.apiDirectory,
    path.join(config.repositoryRoot, 'site/public/data/api'),
  );
  assert.equal(
    config.manualDirectory,
    path.join(config.repositoryRoot, 'site/public/data/manual'),
  );
});

void test('rejects config and data paths that escape the repository root', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-site-config-'));

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en', 'zh-CN'],
      api: { dataDirectory: '../outside' },
      manual: { dataDirectory: 'site/public/data/manual' },
    }),
  );
  await assert.rejects(
    loadSiteConfig('../outside.json', root),
    /inside the repository/u,
  );
  await assert.rejects(
    loadSiteConfig('site.config.json', root),
    /stay inside the repository/u,
  );
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en', 'zh-CN'],
      api: { dataDirectory: 'site/public/data/api' },
      manual: { dataDirectory: '../outside' },
    }),
  );
  await assert.rejects(
    loadSiteConfig('site.config.json', root),
    /stay inside the repository/u,
  );
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en', 'zh-CN'],
      api: { dataDirectory: 'site/public/data/api' },
      manual: { dataDirectory: 42 },
    }),
  );
  await assert.rejects(
    loadSiteConfig('site.config.json', root),
    /manual\.dataDirectory must be a string/u,
  );
});

void test('rejects symlinked API directories', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-site-config-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'docs-site-outside-'));

  t.onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  await symlink(outside, path.join(root, 'api-link'));
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en', 'zh-CN'],
      api: { dataDirectory: 'api-link' },
      manual: { dataDirectory: 'site/public/data/manual' },
    }),
  );

  await assert.rejects(
    loadSiteConfig('site.config.json', root),
    /Symlink paths are not allowed/u,
  );
});

void test('loads Yuque and local manual collections with repository-relative paths', async t => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'docs-site-manual-config-'),
  );

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'zh-CN',
      locales: ['zh-CN', 'en'],
      api: {
        dataDirectory: 'site/public/data/api',
        packages: [
          {
            key: 'product-guide',
            name: '@example/product-guide',
            directory: 'packages/product-guide',
            tsconfig: 'tsconfig.json',
            entries: [
              {
                key: 'root',
                source: 'src/index.ts',
                types: 'dist/index.d.ts',
              },
            ],
            readme: {
              sourceLocale: 'en',
              files: {
                'zh-CN': 'README-zh_CN.md',
                en: 'README.md',
              },
            },
          },
        ],
      },
      manual: {
        dataDirectory: 'site/public/data/manual',
        collections: [
          {
            key: 'product-guide',
            routePrefix: 'product',
            source: {
              type: 'yuque',
              mode: 'repo',
              baseURL: 'https://yuque.internal/api/v2',
              namespace: 'team/product-guide',
              tokenEnv: 'token',
              locale: 'zh-CN',
            },
            ignore: {
              docIds: ['123'],
              slugs: ['draft'],
              titleContains: ['[private]'],
            },
          },
          {
            key: 'selected',
            source: {
              type: 'yuque',
              mode: 'documents',
              baseURL: 'https://www.yuque.com/api/v2',
              tokenEnv: 'YUQUE_TOKEN',
              locale: 'zh-CN',
              documents: [
                {
                  namespace: 'team/one',
                  slug: 'article',
                  routeSlug: 'article',
                  group: '精选',
                },
              ],
            },
          },
          {
            key: 'local',
            source: {
              type: 'local',
              directory: 'site/manual-local/developer',
              locale: 'en',
            },
          },
        ],
      },
    }),
  );

  const config = await loadSiteConfig('site.config.json', root);

  assert.equal(
    config.apiPackages?.[0]?.readme?.files['en'],
    path.join(config.repositoryRoot, 'packages/product-guide/README.md'),
  );
  assert.equal(config.apiPackages?.[0]?.readme?.sourceLocale, 'en');
  assert.equal(config.manuals?.length, 3);
  assert.equal(config.manuals?.[0]?.source.type, 'yuque');
  assert.deepEqual(
    config.manuals?.[1]?.source.type === 'yuque' &&
      config.manuals[1].source.mode === 'documents'
      ? config.manuals[1].source.documents.map(document => document.routeSlug)
      : [],
    ['article'],
  );
  assert.equal(
    config.manuals?.[2]?.source.type === 'local'
      ? config.manuals[2].source.directory
      : undefined,
    path.join(config.repositoryRoot, 'site/manual-local/developer'),
  );
});

void test('rejects legacy top-level API and manual fields', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-site-config-'));

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en'],
      api: { dataDirectory: 'site/public/data/api' },
      packageReadmes: { engine: { en: 'packages/engine/README.md' } },
      packageReadmeSourceLocales: { engine: 'en' },
      manual: { dataDirectory: 'site/public/data/manual' },
      manuals: [],
    }),
  );

  await assert.rejects(
    loadSiteConfig('site.config.json', root),
    /packageReadmes must be configured under api/u,
  );

  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'en',
      locales: ['en'],
      api: {
        dataDirectory: 'site/public/data/api',
        packageReadmes: { engine: { en: 'packages/engine/README.md' } },
      },
    }),
  );

  await assert.rejects(
    loadSiteConfig('site.config.json', root),
    /api\.packageReadmes must be configured under api\.packages/u,
  );
});

void test('rejects invalid Yuque credentials, selectors, route slugs, and duplicate collection keys', async t => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'docs-site-manual-config-'),
  );

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'site.config.json'),
    JSON.stringify({
      sourceLocale: 'zh-CN',
      locales: ['zh-CN', 'en'],
      api: { dataDirectory: 'site/public/data/api' },
      manual: {
        dataDirectory: 'site/public/data/manual',
        collections: [
          {
            key: 'invalid',
            source: {
              type: 'yuque',
              mode: 'documents',
              baseURL: 'file:///etc/passwd',
              tokenEnv: 'token-value',
              locale: 'zh-CN',
              documents: [
                {
                  namespace: 'team/book',
                  slug: 'article',
                  routeSlug: '../escape',
                },
              ],
            },
            ignore: { documentRefs: [{ namespace: 'team', slug: 'article' }] },
          },
          {
            key: 'invalid',
            source: {
              type: 'local',
              directory: '../outside',
              locale: 'fr',
            },
          },
        ],
      },
    }),
  );

  await assert.rejects(
    loadSiteConfig('site.config.json', root),
    /Invalid docs site config.*manual\.collections/u,
  );
});
