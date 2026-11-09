import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'vitest';
import type { TestContext } from 'vitest';
import { cleanAPISnapshots } from '@galacean/docs-tools';

const execFileAsync = promisify(execFile);

async function fixture(t: TestContext) {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'docs-api-snapshot-cleanup-'),
  );
  const dataRoot = path.join(repositoryRoot, 'site/public/data');
  const apiDirectory = path.join(dataRoot, 'api');
  const snapshotsDirectory = path.join(apiDirectory, 'snapshots');
  const versionDirectory = path.join(apiDirectory, 'widget/1.0.0');
  const sourceContents = `${JSON.stringify({ locale: 'en' })}\n`;
  const referencedName = `${createHash('sha256')
    .update(sourceContents)
    .digest('hex')}.api.json`;
  const orphanContents = `${JSON.stringify({ locale: 'unused' })}\n`;
  const orphanName = `${createHash('sha256')
    .update(orphanContents)
    .digest('hex')}.api.json`;
  const invalidHashPath = path.join(snapshotsDirectory, `${'a'.repeat(64)}.api.json`);
  const manifestPath = path.join(apiDirectory, 'manifest.json');
  const configPath = path.join(repositoryRoot, 'site/site.config.ts');

  await mkdir(versionDirectory, { recursive: true });
  await mkdir(snapshotsDirectory, { recursive: true });
  await writeFile(path.join(snapshotsDirectory, referencedName), sourceContents);
  await writeFile(path.join(snapshotsDirectory, orphanName), orphanContents);
  await writeFile(invalidHashPath, `${JSON.stringify({ locale: 'invalid' })}\n`);
  await writeFile(
    path.join(versionDirectory, 'en.api.json'),
    `${JSON.stringify({ $ref: `api/snapshots/${referencedName}` })}\n`,
  );
  const version = {
    version: '1.0.0',
    snapshot: 'b'.repeat(64),
    commit: 'fixture',
    entries: [],
    json: { en: 'api/widget/1.0.0/en.api.json' },
  };
  const manifest = {
    schemaVersion: 2,
    defaultVersion: 'current',
    packages: [
      {
        key: 'widget',
        name: '@example/widget',
        latestVersion: '1.0.0',
        entries: [],
        current: { ...version, version: 'current', packageVersion: '1.0.0' },
        versions: [version],
      },
    ],
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `export default ${JSON.stringify({
      sourceLocale: 'en',
      locales: ['en'],
      api: { dataDirectory: 'site/public/data/api' },
    })} as const;\n`,
  );
  t.onTestFinished(() => rm(repositoryRoot, { recursive: true, force: true }));

  return {
    repositoryRoot,
    dataRoot,
    apiDirectory,
    config: { repositoryRoot, apiDirectory },
    referencedPath: path.join(snapshotsDirectory, referencedName),
    orphanPath: path.join(snapshotsDirectory, orphanName),
    invalidHashPath,
    configPath,
  };
}

void test('deletes only confirmed orphan snapshots by default', async t => {
  const values = await fixture(t);
  const result = await cleanAPISnapshots(values.config);

  assert.deepEqual(result.deleted, [
    path.relative(values.dataRoot, values.orphanPath).split(path.sep).join('/'),
  ]);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0]?.reason ?? '', /content hash/u);
  await readFile(values.referencedPath);
  await assert.rejects(readFile(values.orphanPath), { code: 'ENOENT' });
  await readFile(values.invalidHashPath);
});

void test('CLI deletes confirmed orphan snapshots by default', async t => {
  const values = await fixture(t);
  const cliPath = path.resolve(import.meta.dirname, '../bin/galacean-docs.mjs');
  const result = await execFileAsync(
    process.execPath,
    [
      cliPath,
      'api',
      'snapshots',
      'clean',
      '--config',
      'site/site.config.ts',
    ],
    { cwd: values.repositoryRoot },
  );

  assert.match(result.stdout, /deleted/u);
  await assert.rejects(readFile(values.orphanPath), { code: 'ENOENT' });
});
