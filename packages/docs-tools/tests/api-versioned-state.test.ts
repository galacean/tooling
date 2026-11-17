import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import {
  generateAPIDocumentation,
  generateVersionedAPIDocumentation,
  inspectAPIVersionState,
} from '@galacean/docs-tools';
import type { DocsSiteConfig } from '@galacean/docs-tools';

async function fixture() {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'docs-api-version-state-'),
  );
  const apiDirectory = path.join(repositoryRoot, 'site/data/api');
  const version = '1.2.3';
  const commit = 'a'.repeat(40);
  const modelHash = 'b'.repeat(64);
  const packages = [
    { key: 'first', name: '@example/first' },
    { key: 'second', name: '@example/second' },
  ];
  const config: DocsSiteConfig = {
    repositoryRoot,
    configPath: path.join(repositoryRoot, 'site/docs.config.json'),
    sourceLocale: 'en',
    locales: ['en', 'zh-CN'],
    apiDirectory,
    apiVersions: {
      repository: 'https://github.com/example/project.git',
      versions: ['1.2.3'],
    },
    manualDirectory: path.join(repositoryRoot, 'site/data/manual'),
    translationWorkDirectory: path.join(repositoryRoot, 'tmp/docs-tools'),
    apiPackages: packages.map(pkg => ({
      ...pkg,
      directory: path.join(repositoryRoot, 'packages', pkg.key),
      tsconfig: path.join(repositoryRoot, 'packages', pkg.key, 'tsconfig.json'),
      entries: [],
    })),
  };

  async function writeJSON(filename: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, `${JSON.stringify(value)}\n`);
  }

  for (const locale of config.locales) {
    const snapshot = {
      locale,
      apiSnapshot: {
        commit,
        generatorVersion: '0.28.20',
        snapshot: modelHash,
        packages: packages.map(pkg => ({ ...pkg, version, entries: [] })),
      },
    };
    const contents = `${JSON.stringify(snapshot)}\n`;
    const contentHash = createHash('sha256').update(contents).digest('hex');
    const snapshotReference = `api/snapshots/${contentHash}.api.json`;

    await writeJSON(path.join(repositoryRoot, 'site/data', snapshotReference), snapshot);
    for (const pkg of packages) {
      await writeJSON(
        path.join(apiDirectory, pkg.key, version, `${locale}.api.json`),
        { $ref: snapshotReference },
      );
    }
  }
  const versionRecords = packages.map(pkg => {
    const json = config.locales.reduce<Record<string, string>>(
      (result, locale) => {
        result[locale] = `api/${pkg.key}/${version}/${locale}.api.json`;

        return result;
      },
      {},
    );
    const record = {
      version,
      snapshot: modelHash,
      commit,
      entries: [],
      json,
    };

    return {
      key: pkg.key,
      name: pkg.name,
      latestVersion: version,
      entries: [],
      current: { ...record, version: 'current', packageVersion: version },
      versions: [record],
    };
  });

  await writeJSON(path.join(apiDirectory, 'manifest.json'), {
    schemaVersion: 2,
    defaultVersion: 'current',
    packages: versionRecords,
  });
  await writeJSON(path.join(apiDirectory, 'version-sources.json'), {
    schemaVersion: 1,
    versions: [
      {
        version,
        commit,
        generatorVersion: '0.0.8',
        typeDocVersion: '0.28.20',
        typescriptVersion: '5.9.3',
      },
    ],
  });

  return { repositoryRoot, apiDirectory, config, version };
}

void test('marks a version missing when no manifest or source audit exists', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  await rm(values.apiDirectory, { recursive: true, force: true });

  assert.deepEqual(await inspectAPIVersionState(values.config, values.version), {
    status: 'missing',
  });
});

void test('treats a source record without package entries as an uncommitted version', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  const sourcesPath = path.join(values.apiDirectory, 'version-sources.json');
  const sources = JSON.parse(
    await (await import('node:fs/promises')).readFile(sourcesPath, 'utf8'),
  ) as {
    versions: {
      version: string;
      commit: string;
      generatorVersion: string;
      typeDocVersion: string;
      typescriptVersion: string;
    }[];
  };

  sources.versions.push({
    version: '1.2.4',
    commit: 'c'.repeat(40),
    generatorVersion: '0.0.8',
    typeDocVersion: '0.28.20',
    typescriptVersion: '5.9.3',
  });
  await (await import('node:fs/promises')).writeFile(
    sourcesPath,
    `${JSON.stringify(sources)}\n`,
  );

  assert.deepEqual(await inspectAPIVersionState(values.config, '1.2.4'), {
    status: 'missing',
  });
});

void test('accepts a complete, hash-valid version shared by every package locale', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );

  assert.deepEqual(await inspectAPIVersionState(values.config, values.version), {
    status: 'complete',
    source: {
      version: values.version,
      commit: 'a'.repeat(40),
      generatorVersion: '0.0.8',
      typeDocVersion: '0.28.20',
      typescriptVersion: '5.9.3',
    },
  });
});

void test('accepts a complete version when configured packages are reordered', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  values.config.apiPackages?.reverse();

  assert.equal(
    (await inspectAPIVersionState(values.config, values.version)).status,
    'complete',
  );
});

void test('skips all build dependencies for a complete configured version', async t => {
  const values = await fixture();
  let buildCalled = false;

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  values.config.apiVersions = {
    repository: 'https://github.com/example/project.git',
    versions: [values.version],
  };

  const result = await generateAPIDocumentation(values.config, undefined, {
    buildDeclarations: async () => {
      buildCalled = true;
      throw new Error('complete versions must not build');
    },
    convert: async () => {
      throw new Error('complete versions must not run TypeDoc');
    },
    getCommit: () => 'a'.repeat(40),
    generatorVersion: async () => '0.28.20',
  });

  assert.equal(buildCalled, false);
  assert.deepEqual(result.versionStatuses, [
    { version: values.version, status: 'complete' },
  ]);
});

void test('builds a missing version in staging and commits source audit before manifest', async t => {
  const values = await fixture();
  const version = '1.2.4';
  const commit = 'c'.repeat(40);
  let buildCount = 0;
  const reportedStatuses: string[] = [];

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  await rm(values.apiDirectory, { recursive: true, force: true });
  values.config.apiVersions = {
    repository: 'https://github.com/example/project.git',
    versions: [version],
  };
  const packages = values.config.apiPackages!.map(pkg => ({
    key: pkg.key,
    name: pkg.name,
    version,
    entries: [],
  }));
  const project = {
    id: 1,
    name: 'Fixture',
    kind: 1,
    variant: 'project',
    flags: {},
    symbolIdMap: {},
    files: { entries: {}, reflections: {} },
    children: [],
  };

  const result = await generateVersionedAPIDocumentation(
    values.config,
    values.config.apiPackages!.map(pkg => pkg.key),
    async () => {
      buildCount += 1;

      return {
        metadata: {
          commit,
          generatorVersion: '0.28.20',
          sourceHash: 'd'.repeat(64),
          packages,
        },
        project,
        typescriptVersion: '5.9.3',
      };
    },
    '0.0.8',
    status => reportedStatuses.push(`${status.version}:${status.status}`),
  );
  const manifest = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      path.join(values.apiDirectory, 'manifest.json'),
      'utf8',
    ),
  ) as { packages: { current: { packageVersion: string } }[] };
  const sources = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      path.join(values.apiDirectory, 'version-sources.json'),
      'utf8',
    ),
  ) as { versions: { version: string; commit: string }[] };

  assert.equal(buildCount, 1);
  assert.deepEqual(result.versionStatuses, [{ version, status: 'missing' }]);
  assert.deepEqual(reportedStatuses, [`${version}:missing`]);
  assert.ok(manifest.packages.every(pkg => pkg.current.packageVersion === version));
  assert.deepEqual(sources.versions, [{
    version,
    commit,
    generatorVersion: '0.0.8',
    typeDocVersion: '0.28.20',
    typescriptVersion: '5.9.3',
  }]);
});

void test('rejects a snapshot whose content does not match its address', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  const snapshotDirectory = path.join(values.repositoryRoot, 'site/data/api/snapshots');
  const snapshotFiles = (await import('node:fs/promises')).readdir(snapshotDirectory);
  const [snapshotFilename] = await snapshotFiles;

  if (snapshotFilename === undefined) {
    throw new Error('Expected fixture snapshot');
  }
  await writeFile(path.join(snapshotDirectory, snapshotFilename), 'corrupt\n');

  const state = await inspectAPIVersionState(values.config, values.version);

  assert.equal(state.status, 'invalid');
  assert.match(state.reason, /snapshot hash is invalid/u);
});

void test('leaves published API data unchanged when a missing tag build fails', async t => {
  const values = await fixture();
  const manifestPath = path.join(values.apiDirectory, 'manifest.json');
  const sourcesPath = path.join(values.apiDirectory, 'version-sources.json');
  const manifestBefore = await (await import('node:fs/promises')).readFile(
    manifestPath,
    'utf8',
  );
  const sourcesBefore = await (await import('node:fs/promises')).readFile(
    sourcesPath,
    'utf8',
  );

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  values.config.apiVersions = {
    repository: 'https://github.com/example/project.git',
    versions: [values.version, '1.2.4'],
  };

  await assert.rejects(
    generateVersionedAPIDocumentation(
      values.config,
      values.config.apiPackages!.map(pkg => pkg.key),
      async () => {
        throw new Error('tag unavailable');
      },
      '0.0.8',
    ),
    /tag unavailable/u,
  );

  assert.equal(await (await import('node:fs/promises')).readFile(manifestPath, 'utf8'), manifestBefore);
  assert.equal(await (await import('node:fs/promises')).readFile(sourcesPath, 'utf8'), sourcesBefore);
});
