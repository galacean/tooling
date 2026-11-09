import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { assembleAPIDocumentation } from '@galacean/docs-tools';
import type {
  APIDocumentationMetadata,
  DocsSiteConfig,
} from '@galacean/docs-tools';

async function fixture() {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'docs-api-assemble-'),
  );
  const apiDirectory = path.join(repositoryRoot, 'site/public/data/api');
  const project: Record<string, unknown> = {
    schemaVersion: '2.0',
    id: 1,
    name: 'Fixture',
    kind: 1,
    variant: 'project',
    flags: {},
    symbolIdMap: {},
    files: { entries: {}, reflections: {} },
    children: [
      {
        id: 2,
        name: 'Root',
        kind: 256,
        variant: 'declaration',
        flags: {},
        comment: {
          summary: [{ kind: 'text', text: 'Root source description.' }],
        },
      },
      {
        id: 3,
        name: 'Agent',
        kind: 256,
        variant: 'declaration',
        flags: {},
        comment: {
          summary: [{ kind: 'text', text: 'Agent source description.' }],
        },
      },
    ],
  };
  const packages = [
    {
      key: 'widget-dir',
      name: '@example/real-widget',
      version: '1.2.3',
      entries: [
        {
          key: 'root',
          source: 'src/index.ts',
          types: 'dist/index.d.ts',
          id: 10,
          symbols: [{ name: 'Root', id: 2, kind: 256 }],
        },
      ],
    },
    {
      key: 'agent',
      name: '@example/agent-sdk',
      version: '0.4.0-alpha.1',
      entries: [
        {
          key: 'root',
          source: 'src/index.ts',
          types: 'dist/index.d.ts',
          id: 11,
          symbols: [{ name: 'Agent', id: 3, kind: 256 }],
        },
      ],
    },
  ] as APIDocumentationMetadata['packages'];
  const metadata: APIDocumentationMetadata = {
    commit: 'c'.repeat(40),
    generatorVersion: '0.28.20',
    sourceHash: 'b'.repeat(64),
    packages,
  };
  const config: DocsSiteConfig = {
    repositoryRoot,
    configPath: path.join(repositoryRoot, 'site/site.config.ts'),
    sourceLocale: 'en',
    locales: ['en', 'zh-CN'],
    apiDirectory,
    translationWorkDirectory: path.join(
      repositoryRoot,
      'tmp/docs-tools/api-translation',
    ),
  };

  return { repositoryRoot, apiDirectory, project, metadata, config };
}

async function writeJSON(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function snapshotFile(values: Awaited<ReturnType<typeof fixture>>, relativePath: string): string {
  return path.join(path.dirname(values.apiDirectory), relativePath);
}

void test('shares one content-addressed snapshot across packages', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  const result = await assembleAPIDocumentation(
    values.project,
    values.metadata,
    values.config,
  );
  const manifest = JSON.parse(
    await readFile(path.join(values.apiDirectory, 'manifest.json'), 'utf8'),
  ) as {
    packages: {
      key: string;
      current: { packageVersion: string; snapshot: string; json: Record<string, string> };
    }[];
  };
  const byKey = new Map(manifest.packages.map(pkg => [pkg.key, pkg]));

  assert.equal(result.packages, 2);
  assert.equal(byKey.get('widget-dir')?.current.packageVersion, '1.2.3');
  assert.equal(byKey.get('agent')?.current.packageVersion, '0.4.0-alpha.1');
  assert.equal(
    byKey.get('widget-dir')?.current.json['en'],
    'api/widget-dir/1.2.3/en.api.json',
  );
  assert.equal(
    byKey.get('agent')?.current.json['zh-CN'],
    'api/agent/0.4.0-alpha.1/zh-CN.api.json',
  );
  assert.equal(
    byKey.get('widget-dir')?.current.snapshot,
    byKey.get('agent')?.current.snapshot,
  );
  const widgetWrapper = JSON.parse(
    await readFile(snapshotFile(values, byKey.get('widget-dir')!.current.json['en']!), 'utf8'),
  ) as { $ref: string };
  const agentWrapper = JSON.parse(
    await readFile(snapshotFile(values, byKey.get('agent')!.current.json['en']!), 'utf8'),
  ) as { $ref: string };

  assert.equal(widgetWrapper.$ref, agentWrapper.$ref);
  assert.equal((await readdir(path.dirname(snapshotFile(values, widgetWrapper.$ref)))).length, 2);
  assert.equal(result.warnings.length, 2);
});

void test('preserves translations and does not overwrite an unselected package snapshot', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  await assembleAPIDocumentation(
    values.project,
    values.metadata,
    values.config,
  );
  const initialManifest = JSON.parse(
    await readFile(path.join(values.apiDirectory, 'manifest.json'), 'utf8'),
  ) as { packages: { key: string; current: { json: Record<string, string> } }[] };
  const initialByKey = new Map(initialManifest.packages.map(pkg => [pkg.key, pkg]));
  const agentPath = snapshotFile(values, initialByKey.get('agent')!.current.json['en']!);
  const agentBefore = await readFile(agentPath, 'utf8');
  const targetPath = snapshotFile(values, initialByKey.get('widget-dir')!.current.json['zh-CN']!);
  const targetWrapper = JSON.parse(await readFile(targetPath, 'utf8')) as { $ref: string };
  const target = JSON.parse(await readFile(snapshotFile(values, targetWrapper.$ref), 'utf8')) as {
    children: {
      name: string;
      comment: {
        summary: { kind: string; text: string }[];
        sourceLocale?: string;
      };
    }[];
    apiSnapshot: unknown;
  };

  target.children[0]!.comment.summary[0]!.text = '根类型译文。';
  target.children[0]!.comment.sourceLocale = 'zh-CN';
  await writeJSON(targetPath, target);
  const updatedMetadata = {
    ...values.metadata,
    commit: 'd'.repeat(40),
    packages: values.metadata.packages.map(pkg =>
      pkg.key === 'widget-dir' ? { ...pkg, version: '1.2.4' } : pkg,
    ),
  };

  await assembleAPIDocumentation(
    values.project,
    updatedMetadata,
    values.config,
    ['widget-dir'],
  );
  const manifest = JSON.parse(
    await readFile(path.join(values.apiDirectory, 'manifest.json'), 'utf8'),
  ) as {
    packages: { key: string; current: { packageVersion: string; json: Record<string, string> } }[];
  };
  const widget = manifest.packages.find(pkg => pkg.key === 'widget-dir')!;
  const agent = manifest.packages.find(pkg => pkg.key === 'agent')!;
  const localized = JSON.parse(
    await readFile(snapshotFile(values, widget.current.json['zh-CN']!), 'utf8'),
  ) as { $ref?: string };
  const localizedSnapshot = JSON.parse(
    await readFile(snapshotFile(values, localized.$ref!), 'utf8'),
  ) as {
    children: {
      name: string;
      comment: { summary: { kind: string; text: string }[] };
    }[];
    apiSnapshot: { packages: { key: string; version: string }[] };
  };

  assert.equal(localizedSnapshot.children[0]?.comment.summary[0]?.text, '根类型译文。');
  assert.deepEqual(
    localizedSnapshot.apiSnapshot.packages.map(pkg => pkg.key),
    ['widget-dir', 'agent'],
  );
  assert.equal(await readFile(agentPath, 'utf8'), agentBefore);
  assert.equal(widget.current.packageVersion, '1.2.4');
  assert.equal(agent.current.packageVersion, '0.4.0-alpha.1');
});

void test('retains latest versions per major/minor and deletes unreferenced snapshots', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  await assembleAPIDocumentation(
    values.project,
    values.metadata,
    values.config,
  );

  let unretainedSnapshotPath: string | undefined;

  for (const version of ['1.2.4', '2.0.0', '1.2.5']) {
    const metadata = {
      ...values.metadata,
      packages: values.metadata.packages.map(pkg =>
        pkg.key === 'widget-dir' ? { ...pkg, version } : pkg,
      ),
    };

    await assembleAPIDocumentation(values.project, metadata, values.config, [
      'widget-dir',
    ]);
    if (version === '1.2.4') {
      const interimManifest = JSON.parse(
        await readFile(path.join(values.apiDirectory, 'manifest.json'), 'utf8'),
      ) as { packages: { key: string; current: { json: Record<string, string> } }[] };

      const wrapperPath = interimManifest.packages.find(pkg => pkg.key === 'widget-dir')!.current.json['en']!;
      const wrapper = JSON.parse(
        await readFile(snapshotFile(values, wrapperPath), 'utf8'),
      ) as { $ref: string };

      unretainedSnapshotPath = wrapper.$ref;
    }
  }

  const manifest = JSON.parse(
    await readFile(path.join(values.apiDirectory, 'manifest.json'), 'utf8'),
  ) as {
    packages: {
      key: string;
      current: { packageVersion: string };
      versions: { version: string }[];
    }[];
  };
  const widget = manifest.packages.find(pkg => pkg.key === 'widget-dir');

  assert.equal(widget?.current.packageVersion, '2.0.0');
  assert.deepEqual(
    widget?.versions.map(item => item.version),
    ['2.0.0', '1.2.5'],
  );
  assert.equal(
    manifest.packages.find(pkg => pkg.key === 'agent')?.current.packageVersion,
    '0.4.0-alpha.1',
  );
  assert.ok(unretainedSnapshotPath);
  await assert.rejects(
    readFile(snapshotFile(values, unretainedSnapshotPath)),
    { code: 'ENOENT' },
  );
});

void test('starts a new package-key history from current code and leaves flat snapshots untouched', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  const oldPath = path.join(values.apiDirectory, '1.2.3/en.api.json');
  const oldChinesePath = path.join(values.apiDirectory, '1.2.3/zh-CN.api.json');
  const oldEnglishSnapshot = '{"legacy":"english"}\n';
  const oldChineseSnapshot = '{"legacy":"chinese"}\n';
  const oldManifest = {
    schemaVersion: 2,
    defaultVersion: 'current',
    packages: values.metadata.packages.map(pkg => {
      const version = {
        version: pkg.version,
        snapshot: 'a'.repeat(64),
        commit: 'a'.repeat(40),
        entries: pkg.entries,
        json: {
          en: `api/${pkg.version}/en.api.json`,
          'zh-CN': `api/${pkg.version}/zh-CN.api.json`,
        },
      };

      return {
        key: pkg.key,
        name: pkg.name,
        latestVersion: pkg.version,
        entries: pkg.entries,
        current: {
          ...version,
          version: 'current',
          packageVersion: pkg.version,
        },
        versions: [version],
      };
    }),
  };

  await writeJSON(path.join(values.apiDirectory, 'manifest.json'), oldManifest);
  await mkdir(path.dirname(oldPath), { recursive: true });
  await writeFile(oldPath, oldEnglishSnapshot);
  await writeFile(oldChinesePath, oldChineseSnapshot);

  const result = await assembleAPIDocumentation(
    values.project,
    values.metadata,
    values.config,
  );
  const manifest = JSON.parse(
    await readFile(path.join(values.apiDirectory, 'manifest.json'), 'utf8'),
  ) as {
    packages: {
      key: string;
      current: { snapshot: string; json: Record<string, string> };
      versions: { version: string }[];
    }[];
  };

  assert.ok(
    result.warnings.some(warning =>
      warning.includes('legacy flat API manifest was ignored'),
    ),
  );
  assert.equal(manifest.packages[0]?.versions.length, 1);
  assert.equal(manifest.packages[0]?.current.json['en'], 'api/widget-dir/1.2.3/en.api.json');
  assert.equal(await readFile(oldPath, 'utf8'), oldEnglishSnapshot);
  assert.equal(await readFile(oldChinesePath, 'utf8'), oldChineseSnapshot);
  await assert.doesNotReject(
    readFile(snapshotFile(values, manifest.packages[0].current.json['en'])),
  );
});
