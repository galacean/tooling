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
    translationWorkDirectory: 'tmp/docs-tools/api-translation',
  } satisfies Record<string, unknown>;\n`,
  );

  const config = await loadSiteConfig('site/site.config.ts', root);

  assert.equal(config.sourceLocale, 'zh-CN');
  assert.deepEqual(config.locales, ['zh-CN', 'en']);
  assert.equal(
    config.apiDirectory,
    path.join(config.repositoryRoot, 'site/public/data/api'),
  );
  assert.equal(
    config.manualDirectory,
    path.join(config.repositoryRoot, 'site/generated/manual'),
  );
  assert.equal(
    config.translationWorkDirectory,
    path.join(config.repositoryRoot, 'tmp/docs-tools/api-translation'),
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
            translations: { en: 'site/manual-translations/product-guide/en' },
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
  assert.equal(
    config.manuals?.[0]?.translations?.['en'],
    path.join(
      config.repositoryRoot,
      'site/manual-translations/product-guide/en',
    ),
  );
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
