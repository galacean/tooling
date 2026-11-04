import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  rename as renameFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'vitest';
import type { TestContext } from 'vitest';
import {
  applyTranslationPairs,
  applyTranslationPairsWithRename,
  contentHash,
  extractTranslationTasks,
  sourceProject,
} from '@galacean/docs-tools';

const execFileAsync = promisify(execFile);
const version = '1.2.3';
const packageKey = 'widget';
const sourceLocale = 'zh-CN';
const targetLocale = 'en';

async function fixture(t: TestContext) {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'docs-api-apply-'),
  );
  const dataDirectory = path.join(repositoryRoot, 'site/public/data');
  const apiDirectory = path.join(dataDirectory, 'api');
  const translationWorkDirectory = path.join(
    repositoryRoot,
    'tmp/docs-tools/api-translation',
  );
  const versionDirectory = path.join(apiDirectory, packageKey, version);
  const apiEntry = {
    key: 'root',
    source: 'src/index.ts',
    types: './dist/index.d.ts',
    id: 1,
    symbols: [{ name: 'Widget', id: 2, kind: 256 }],
  };
  const apiSnapshot = {
    commit: 'abc123',
    packages: [
      {
        key: packageKey,
        name: '@example/widget',
        version,
        entries: [apiEntry],
      },
    ],
  };
  const project = {
    id: 1,
    name: 'Fixture',
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
        comment: { summary: [{ kind: 'text', text: '一个组件。' }] },
      },
    ],
  };
  const sourcePath = path.join(versionDirectory, `${sourceLocale}.api.json`);
  const targetPath = path.join(versionDirectory, `${targetLocale}.api.json`);
  const manifestPath = path.join(apiDirectory, 'manifest.json');
  const json = {
    [sourceLocale]: `api/${packageKey}/${version}/${sourceLocale}.api.json`,
    [targetLocale]: `api/${packageKey}/${version}/${targetLocale}.api.json`,
  };
  const manifest = {
    schemaVersion: 2,
    defaultVersion: 'current',
    packages: [
      {
        key: packageKey,
        name: '@example/widget',
        latestVersion: version,
        entries: [apiEntry],
        current: {
          version: 'current',
          packageVersion: version,
          snapshot: 'a'.repeat(64),
          commit: apiSnapshot.commit,
          entries: [apiEntry],
          json,
        },
        versions: [
          {
            version,
            snapshot: 'a'.repeat(64),
            commit: apiSnapshot.commit,
            entries: [apiEntry],
            json,
          },
        ],
      },
    ],
  };

  await mkdir(versionDirectory, { recursive: true });
  await writeFile(
    path.join(repositoryRoot, 'site/site.config.ts'),
    `export default ${JSON.stringify({
      sourceLocale,
      locales: [sourceLocale, targetLocale],
      api: { dataDirectory: 'site/public/data/api' },
      translationWorkDirectory: 'tmp/docs-tools/api-translation',
    })} as const;\n`,
  );
  await writeFile(
    sourcePath,
    `${JSON.stringify({ ...project, locale: sourceLocale, apiSnapshot })}\n`,
  );
  await writeFile(
    targetPath,
    `${JSON.stringify({ ...project, locale: targetLocale, apiSnapshot })}\n`,
  );
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  t.onTestFinished(() => rm(repositoryRoot, { recursive: true, force: true }));

  return {
    repositoryRoot,
    apiDirectory,
    translationWorkDirectory,
    sourcePath,
    targetPath,
    manifestPath,
    config: {
      repositoryRoot,
      sourceLocale,
      locales: [sourceLocale, targetLocale],
      apiDirectory,
      translationWorkDirectory,
    },
  };
}

async function createTranslation(t: TestContext) {
  const values = await fixture(t);
  const [task] = await extractTranslationTasks(
    ['site/public/data/api/widget/1.2.3/en.api.json'],
    values.config,
  );

  assert.ok(task);
  const taskValue = JSON.parse(await readFile(task.taskPath, 'utf8')) as {
    locale: string;
    version: string;
    sourceHash: string;
    fields: { key: string }[];
  };
  const translationPath = path.join(
    path.dirname(task.taskPath),
    '001.en.translation.json',
  );

  await writeFile(
    translationPath,
    `${JSON.stringify(
      {
        locale: taskValue.locale,
        version: taskValue.version,
        sourceHash: taskValue.sourceHash,
        translations: { [taskValue.fields[0]?.key ?? '']: 'A widget.' },
      },
      null,
      2,
    )}\n`,
  );

  return { ...values, taskPath: task.taskPath, translationPath };
}

void test('applies a fresh translation and updates the version and current manifest hashes', async t => {
  const values = await createTranslation(t);
  const originalSource = await readFile(values.sourcePath, 'utf8');
  const originalManifest = JSON.parse(
    await readFile(values.manifestPath, 'utf8'),
  ) as {
    packages: {
      current: { snapshot: string };
      versions: { snapshot: string }[];
    }[];
  };

  const updatedPaths = await applyTranslationPairs(
    [{ taskPath: values.taskPath, translationPath: values.translationPath }],
    values.config,
  );
  const target = JSON.parse(await readFile(values.targetPath, 'utf8')) as {
    locale: string;
    children: { comment: { summary: { text: string }[] } }[];
  };
  const sourceSnapshot = JSON.parse(
    await readFile(values.sourcePath, 'utf8'),
  ) as Record<string, unknown>;
  const manifest = JSON.parse(await readFile(values.manifestPath, 'utf8')) as {
    packages: {
      current: { snapshot: string };
      versions: { snapshot: string }[];
    }[];
  };
  const expectedHash = contentHash({
    source: sourceProject(sourceSnapshot),
    metadata: sourceSnapshot['apiSnapshot'],
    locales: { [sourceLocale]: sourceSnapshot, [targetLocale]: target },
  });

  assert.deepEqual(updatedPaths, [values.targetPath]);
  assert.equal(target.locale, targetLocale);
  assert.equal(target.children[0]?.comment.summary[0]?.text, 'A widget.');
  assert.notEqual(
    manifest.packages[0]?.current.snapshot,
    originalManifest.packages[0]?.current.snapshot,
  );
  assert.equal(
    manifest.packages[0]?.current.snapshot,
    manifest.packages[0]?.versions[0]?.snapshot,
  );
  assert.equal(manifest.packages[0]?.current.snapshot, expectedHash);
  assert.equal(await readFile(values.sourcePath, 'utf8'), originalSource);
  await assert.rejects(readFile(values.taskPath), { code: 'ENOENT' });
  await assert.rejects(readFile(values.translationPath), { code: 'ENOENT' });
});

void test('rejects a stale target without changing it or consuming task files', async t => {
  const values = await createTranslation(t);

  await writeFile(
    values.targetPath,
    `${await readFile(values.targetPath, 'utf8')} `,
  );
  const staleTarget = await readFile(values.targetPath, 'utf8');

  await assert.rejects(
    applyTranslationPairs(
      [{ taskPath: values.taskPath, translationPath: values.translationPath }],
      values.config,
    ),
    /source, target, config, or task fields changed/u,
  );
  assert.equal(await readFile(values.targetPath, 'utf8'), staleTarget);
  await readFile(values.taskPath);
  await readFile(values.translationPath);
});

void test('rejects a target that is not referenced by the manifest locale path', async t => {
  const values = await createTranslation(t);
  const manifest = JSON.parse(await readFile(values.manifestPath, 'utf8')) as {
    packages: {
      current: { json: Record<string, string> };
      versions: { json: Record<string, string> }[];
    }[];
  };

  manifest.packages[0]!.current.json[targetLocale] =
    `api/${packageKey}/${version}/other.api.json`;
  manifest.packages[0]!.versions[0]!.json[targetLocale] =
    `api/${packageKey}/${version}/other.api.json`;
  await writeFile(
    values.manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const targetBefore = await readFile(values.targetPath, 'utf8');

  await assert.rejects(
    applyTranslationPairs(
      [{ taskPath: values.taskPath, translationPath: values.translationPath }],
      values.config,
    ),
    /manifest path does not match translation target/u,
  );
  assert.equal(await readFile(values.targetPath, 'utf8'), targetBefore);
  await readFile(values.taskPath);
  await readFile(values.translationPath);
});

void test('reports partial commit failures and preserves task files for recovery', async t => {
  const values = await createTranslation(t);
  const manifestBefore = await readFile(values.manifestPath, 'utf8');

  await assert.rejects(
    applyTranslationPairsWithRename(
      [{ taskPath: values.taskPath, translationPath: values.translationPath }],
      values.config,
      async (source, destination) => {
        if (destination === values.manifestPath) {
          throw new Error('injected manifest rename failure');
        }
        await renameFile(source, destination);
      },
    ),
    /partially updated .*manifest consistency may require recovery/u,
  );

  const target = JSON.parse(await readFile(values.targetPath, 'utf8')) as {
    children: { comment: { summary: { text: string }[] } }[];
  };

  assert.equal(target.children[0]?.comment.summary[0]?.text, 'A widget.');
  assert.equal(await readFile(values.manifestPath, 'utf8'), manifestBefore);
  await readFile(values.taskPath);
  await readFile(values.translationPath);
});

void test('runs api apply from the mjs CLI', async t => {
  const values = await createTranslation(t);
  const cliPath = path.resolve(import.meta.dirname, '../bin/galacean-docs.mjs');
  const result = await execFileAsync(
    process.execPath,
    [
      cliPath,
      'api',
      'apply',
      '--config',
      'site/site.config.ts',
      path.relative(values.repositoryRoot, values.taskPath),
      path.relative(values.repositoryRoot, values.translationPath),
    ],
    { cwd: values.repositoryRoot },
  );

  assert.match(result.stdout, /Updated .*\/widget\/1\.2\.3\/en\.api\.json/u);
  const target = JSON.parse(await readFile(values.targetPath, 'utf8')) as {
    locale: string;
  };

  assert.equal(target.locale, targetLocale);
});
