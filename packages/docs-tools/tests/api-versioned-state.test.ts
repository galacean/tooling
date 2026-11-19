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
    apiTranslationDirectory: path.join(
      repositoryRoot,
      'tmp/docs-tools/api-translation',
    ),
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

  return { repositoryRoot, apiDirectory, config, version };
}

void test('marks a version missing when no API manifest exists', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  await rm(values.apiDirectory, { recursive: true, force: true });

  assert.deepEqual(await inspectAPIVersionState(values.config, values.version), {
    status: 'missing',
  });
});

void test('marks a version missing when it is absent from the API manifest', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
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
  });
});

void test('rejects package versions that map to different commits', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  const manifestPath = path.join(values.apiDirectory, 'manifest.json');
  const manifest = JSON.parse(
    await (await import('node:fs/promises')).readFile(manifestPath, 'utf8'),
  ) as {
    packages: {
      versions: { version: string; commit: string }[];
      current: { commit: string };
    }[];
  };
  const secondPackage = manifest.packages[1];
  const secondVersion = secondPackage?.versions.find(
    item => item.version === values.version,
  );

  assert.ok(secondPackage);
  assert.ok(secondVersion);
  secondVersion.commit = 'c'.repeat(40);
  secondPackage.current.commit = secondVersion.commit;
  await (await import('node:fs/promises')).writeFile(
    manifestPath,
    `${JSON.stringify(manifest)}\n`,
  );

  const state = await inspectAPIVersionState(values.config, values.version);

  assert.equal(state.status, 'invalid');
  assert.match(state.reason, /commit does not match other API packages/u);
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
  const legacySourcesPath = path.join(
    values.apiDirectory,
    'version-sources.json',
  );
  let buildCalled = false;

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  await writeFile(legacySourcesPath, 'invalid legacy audit');
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
  await assert.rejects(
    (await import('node:fs/promises')).readFile(legacySourcesPath),
    { code: 'ENOENT' },
  );
});

void test('defaults to the latest configured version and ignores missing history', async t => {
  const values = await fixture();
  let buildCalled = false;

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  values.config.apiVersions = {
    repository: 'https://github.com/example/project.git',
    versions: ['1.2.2', values.version],
  };

  const result = await generateVersionedAPIDocumentation(
    values.config,
    values.config.apiPackages!.map(pkg => pkg.key),
    async () => {
      buildCalled = true;
      throw new Error('missing history must not be built by default');
    },
  );

  assert.equal(buildCalled, false);
  assert.deepEqual(result.versionStatuses, [
    { version: values.version, status: 'complete' },
  ]);
});

void test('allows explicit generation of a configured historical version', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  values.config.apiVersions = {
    repository: 'https://github.com/example/project.git',
    versions: ['1.2.2', values.version],
  };

  await assert.rejects(
    generateVersionedAPIDocumentation(
      values.config,
      values.config.apiPackages!.map(pkg => pkg.key),
      async (_config, version) => {
        assert.equal(version, '1.2.2');
        throw new Error('historical version selected');
      },
      undefined,
      { version: '1.2.2' },
    ),
    /historical version selected/u,
  );
});

void test('force reruns a complete selected version without weakening invalid-state checks', async t => {
  const values = await fixture();
  let buildCalled = false;

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  values.config.apiVersions = {
    repository: 'https://github.com/example/project.git',
    versions: [values.version],
  };

  await assert.rejects(
    generateVersionedAPIDocumentation(
      values.config,
      values.config.apiPackages!.map(pkg => pkg.key),
      async () => {
        buildCalled = true;
        throw new Error('forced build reached');
      },
      undefined,
      { force: true },
    ),
    /forced build reached/u,
  );

  assert.equal(buildCalled, true);
});

void test('builds a missing version in staging and commits the manifest', async t => {
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
      };
    },
    status => reportedStatuses.push(`${status.version}:${status.status}`),
  );
  const manifest = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      path.join(values.apiDirectory, 'manifest.json'),
      'utf8',
    ),
  ) as { packages: { current: { packageVersion: string } }[] };

  assert.equal(buildCount, 1);
  assert.deepEqual(result.versionStatuses, [{ version, status: 'missing' }]);
  assert.deepEqual(reportedStatuses, [`${version}:missing`]);
  assert.ok(manifest.packages.every(pkg => pkg.current.packageVersion === version));
  await assert.rejects(
    (await import('node:fs/promises')).readFile(
      path.join(values.apiDirectory, 'version-sources.json'),
    ),
    { code: 'ENOENT' },
  );
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
  const manifestBefore = await (await import('node:fs/promises')).readFile(
    manifestPath,
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
    ),
    /tag unavailable/u,
  );

  assert.equal(await (await import('node:fs/promises')).readFile(manifestPath, 'utf8'), manifestBefore);
});
