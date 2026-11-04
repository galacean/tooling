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
    config.translationWorkDirectory,
    path.join(config.repositoryRoot, 'tmp/docs-tools/api-translation'),
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
    }),
  );

  await assert.rejects(
    loadSiteConfig('site.config.json', root),
    /Symlink paths are not allowed/u,
  );
});
