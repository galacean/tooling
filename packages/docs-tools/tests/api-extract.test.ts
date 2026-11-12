import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'vitest';
import type { TestContext } from 'vitest';
import { extractTranslationTasks } from '@galacean/docs-tools';

const execFileAsync = promisify(execFile);

async function fixture(t: TestContext) {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'docs-api-extract-'),
  );
  const apiDirectory = path.join(repositoryRoot, 'site/public/data/api');
  const translationWorkDirectory = path.join(
    repositoryRoot,
    'tmp/docs-tools/api-translation',
  );
  const versionDirectory = path.join(apiDirectory, 'widget-dir/1.2.3');
  const project = {
    id: 1,
    name: 'fixture',
    kind: 1,
    variant: 'project',
    schemaVersion: '2.0',
    flags: {},
    symbolIdMap: {},
    files: { entries: {}, reflections: {} },
    children: [
      {
        id: 2,
        name: 'Widget',
        kind: 256,
        variant: 'declaration',
        flags: {},
        comment: { summary: [{ kind: 'text', text: 'A widget.' }] },
      },
      {
        id: 3,
        name: 'OtherWidget',
        kind: 256,
        variant: 'declaration',
        flags: {},
        comment: { summary: [{ kind: 'text', text: 'Another widget.' }] },
      },
    ],
  };
  const apiSnapshot = {
    commit: 'a'.repeat(40),
    packages: [
      {
        key: 'widget-dir',
        name: '@example/real-widget',
        version: '1.2.3',
        entries: [
          {
            key: 'root',
            source: 'src/index.ts',
            types: './dist/index.d.ts',
            id: 1,
            symbols: [{ name: 'Widget', id: 2, kind: 256 }],
          },
        ],
      },
      {
        key: 'other-dir',
        name: '@example/other-widget',
        version: '2.3.4',
        entries: [
          {
            key: 'root',
            source: 'src/index.ts',
            types: './dist/index.d.ts',
            id: 4,
            symbols: [{ name: 'OtherWidget', id: 3, kind: 256 }],
          },
        ],
      },
    ],
  };
  const sourcePath = path.join(versionDirectory, 'zh-CN.api.json');
  const targetPath = path.join(versionDirectory, 'en.api.json');

  await mkdir(versionDirectory, { recursive: true });
  await writeFile(
    sourcePath,
    `${JSON.stringify({ ...project, locale: 'zh-CN', apiSnapshot })}\n`,
  );
  await writeFile(
    targetPath,
    `${JSON.stringify({ ...project, locale: 'en', apiSnapshot })}\n`,
  );
  t.onTestFinished(() => rm(repositoryRoot, { recursive: true, force: true }));

  return {
    repositoryRoot,
    apiDirectory,
    translationWorkDirectory,
    sourcePath,
    targetPath,
    config: {
      repositoryRoot,
      sourceLocale: 'zh-CN',
      locales: ['zh-CN', 'en'],
      apiDirectory,
      translationWorkDirectory,
    },
  };
}

void test('extracts tasks from package-key/version paths without modifying snapshots', async t => {
  const values = await fixture(t);
  const before = await Promise.all([
    readFile(values.sourcePath),
    readFile(values.targetPath),
  ]);
  const [result] = await extractTranslationTasks(
    ['site/public/data/api/widget-dir/1.2.3/en.api.json'],
    values.config,
  );

  assert.ok(result);
  const task = JSON.parse(await readFile(result.taskPath, 'utf8')) as {
    packageName: string;
    sourceLocale: string;
    locale: string;
    sourcePath: string;
    targetPath: string;
    fields: { key: string }[];
  };

  assert.equal(result.packageKey, 'widget-dir');
  assert.equal(task.packageName, '@example/real-widget');
  assert.equal(task.sourceLocale, 'zh-CN');
  assert.equal(task.locale, 'en');
  assert.equal(task.sourcePath, 'widget-dir/1.2.3/zh-CN.api.json');
  assert.equal(task.targetPath, 'widget-dir/1.2.3/en.api.json');
  assert.deepEqual(
    task.fields.map(field => field.key),
    ['@example/real-widget|root|Widget|summary'],
  );
  assert.equal(JSON.stringify(task).includes(values.repositoryRoot), false);
  assert.deepEqual(
    await Promise.all([
      readFile(values.sourcePath),
      readFile(values.targetPath),
    ]),
    before,
  );
});

void test('rejects legacy flat API paths and duplicate targets before creating a run directory', async t => {
  const values = await fixture(t);
  const legacyPath = path.join(values.apiDirectory, '1.2.3/en.api.json');

  await assert.rejects(
    extractTranslationTasks([legacyPath], values.config),
    /package-key.*SemVer/u,
  );
  await assert.rejects(
    extractTranslationTasks(
      [
        'site/public/data/api/widget-dir/1.2.3/en.api.json',
        'site/public/data/api/widget-dir/1.2.3/en.api.json',
      ],
      values.config,
    ),
    /Duplicate target/u,
  );
});

void test('runs api extract from the CLI with a TypeScript site config', async t => {
  const values = await fixture(t);
  const configDirectory = path.join(values.repositoryRoot, 'site');
  const configPath = path.join(configDirectory, 'site.config.ts');
  const cliPath = path.resolve(import.meta.dirname, '../bin/galacean-docs.mjs');

  await mkdir(configDirectory, { recursive: true });
  await writeFile(
    configPath,
    `export default ${JSON.stringify({
      sourceLocale: 'zh-CN',
      locales: ['zh-CN', 'en'],
      api: { dataDirectory: 'site/public/data/api' },
      manual: { dataDirectory: 'site/public/data/manual' },
      translationWorkDirectory: 'tmp/docs-tools/api-translation',
    })} as const;\n`,
  );

  const result = await execFileAsync(
    process.execPath,
    [
      cliPath,
      'api',
      'extract',
      '--config',
      'site/site.config.ts',
      'site/public/data/api/widget-dir/1.2.3/en.api.json',
    ],
    { cwd: values.repositoryRoot },
  );

  assert.match(result.stdout, /widget-dir@1\.2\.3 -> en/u);
});
