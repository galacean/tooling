import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'vitest';
import type { TestContext } from 'vitest';
import { buildSearchIndexes } from '@galacean/docs-tools';

const execFileAsync = promisify(execFile);
const locales = ['en', 'zh-CN'];
const packages = [
  {
    key: 'alpha',
    name: '@example/alpha',
    version: '1.0.0',
    id: 11,
    symbol: 'Alpha',
  },
  {
    key: 'beta',
    name: '@example/beta',
    version: '2.0.0',
    id: 22,
    symbol: 'Beta',
  },
];

async function fixture(t: TestContext) {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'docs-search-build-'),
  );
  const dataDirectory = path.join(repositoryRoot, 'site/public/data');
  const apiDirectory = path.join(dataDirectory, 'api');
  const manualDirectory = path.join(dataDirectory, 'manual');
  const entries = packages.map((pkg, index) => ({
    key: 'root',
    source: 'src/index.ts',
    types: './dist/index.d.ts',
    id: index + 1,
    symbols: [{ name: pkg.symbol, id: pkg.id, kind: 256 }],
  }));
  const metadataPackages = packages.map((pkg, index) => ({
    key: pkg.key,
    name: pkg.name,
    version: pkg.version,
    entries: [entries[index]],
  }));
  const project = {
    id: 1,
    name: 'Search fixture',
    kind: 1,
    variant: 'project',
    schemaVersion: '2.0',
    flags: {},
    symbolIdMap: {},
    files: { entries: {}, reflections: {} },
    children: packages.map(pkg => ({
      id: pkg.id,
      name: pkg.symbol,
      kind: 256,
      variant: 'declaration',
      flags: {},
      type: { type: 'intrinsic', name: 'string' },
      comment: {
        summary: [{ kind: 'text', text: `${pkg.symbol} API summary.` }],
      },
    })),
  };
  const manifest = {
    schemaVersion: 2,
    defaultVersion: 'current',
    packages: packages.map((pkg, index) => {
      const entry = entries[index];

      if (entry === undefined) {
        throw new Error(`Missing entry fixture for package ${pkg.key}`);
      }
      const json = Object.fromEntries(
        locales.map(locale => [
          locale,
          `api/${pkg.key}/${pkg.version}/${locale}.api.json`,
        ]),
      );
      const apiEntry = { ...entry, symbols: [...entry.symbols] };
      const versionInfo = {
        version: pkg.version,
        snapshot: 'a'.repeat(64),
        commit: 'fixture',
        entries: [apiEntry],
        json,
      };

      return {
        key: pkg.key,
        name: pkg.name,
        latestVersion: pkg.version,
        entries: [apiEntry],
        current: {
          ...versionInfo,
          version: 'current',
          packageVersion: pkg.version,
        },
        versions: [versionInfo],
      };
    }),
  };

  await mkdir(apiDirectory, { recursive: true });
  await writeFile(
    path.join(apiDirectory, 'manifest.json'),
    `${JSON.stringify(manifest)}\n`,
  );
  for (const [index, pkg] of packages.entries()) {
    const versionDirectory = path.join(apiDirectory, pkg.key, pkg.version);
    const packageDirectory = path.join(repositoryRoot, 'packages', pkg.key);

    await mkdir(versionDirectory, { recursive: true });
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      path.join(packageDirectory, 'README.md'),
      `# ${pkg.name}\n\nEnglish package documentation.\n`,
    );
    if (pkg.key === 'alpha') {
      await writeFile(
        path.join(packageDirectory, 'README-zh_CN.md'),
        '# Alpha 中文包\n\n中文说明。\n',
      );
    }
    for (const locale of locales) {
      const snapshot = {
        ...project,
        locale,
        apiSnapshot: { commit: 'fixture', packages: metadataPackages },
      };

      await writeFile(
        path.join(versionDirectory, `${locale}.api.json`),
        `${JSON.stringify(snapshot)}\n`,
      );
    }
    assert.ok(entries[index]);
  }
  await mkdir(path.join(manualDirectory, 'en'), { recursive: true });
  await mkdir(path.join(manualDirectory, 'zh-CN'), { recursive: true });
  await writeFile(
    path.join(repositoryRoot, 'site/site.config.ts'),
    `export default ${JSON.stringify({
      sourceLocale: 'en',
      locales,
      api: { dataDirectory: 'site/public/data/api' },
      packageReadmes: {
        alpha: {
          en: 'packages/alpha/README.md',
          'zh-CN': 'packages/alpha/README-zh_CN.md',
        },
        beta: { en: 'packages/beta/README.md' },
      },
      translationWorkDirectory: 'tmp/docs-tools/api-translation',
    })} as const;\n`,
  );
  await writeFile(
    path.join(manualDirectory, 'navigation.json'),
    JSON.stringify([
      {
        slug: 'intro',
        title: { en: 'Introduction', 'zh-CN': '介绍' },
        group: { en: 'Start', 'zh-CN': '开始' },
      },
    ]),
  );
  const manualBody = `This manual explains the search fixture in detail. ${'Repeatable manual content. '.repeat(8)}`;

  for (const locale of locales) {
    await writeFile(
      path.join(manualDirectory, locale, 'intro.md'),
      `# ${locale === 'en' ? 'Introduction' : '介绍'}\n\n${manualBody}\n`,
    );
  }
  t.onTestFinished(() => rm(repositoryRoot, { recursive: true, force: true }));

  return {
    repositoryRoot,
    apiDirectory,
    outputDirectory: path.join(dataDirectory, 'search'),
    config: {
      repositoryRoot,
      configPath: path.join(repositoryRoot, 'site/site.config.ts'),
      sourceLocale: 'en',
      locales,
      apiDirectory,
      translationWorkDirectory: path.join(
        repositoryRoot,
        'tmp/docs-tools/api-translation',
      ),
      packageReadmes: {
        alpha: {
          en: path.join(repositoryRoot, 'packages/alpha/README.md'),
          'zh-CN': path.join(repositoryRoot, 'packages/alpha/README-zh_CN.md'),
        },
        beta: { en: path.join(repositoryRoot, 'packages/beta/README.md') },
      },
    },
  };
}

void test('builds search indexes from each package current path and localized content', async t => {
  const values = await fixture(t);
  const counts = await buildSearchIndexes(values.config);
  const english = JSON.parse(
    await readFile(path.join(values.outputDirectory, 'en.json'), 'utf8'),
  ) as {
    category: string;
    name: string;
    summary: string;
    sourceLocale: string;
    url: string;
  }[];
  const chinese = JSON.parse(
    await readFile(path.join(values.outputDirectory, 'zh-CN.json'), 'utf8'),
  ) as {
    category: string;
    name: string;
    summary: string;
    sourceLocale: string;
    url: string;
  }[];

  assert.ok(
    english.some(
      item =>
        item.name === 'Alpha' && item.url.startsWith('/en/api/alpha/current/'),
    ),
  );
  assert.ok(
    english.some(
      item =>
        item.name === 'Beta' && item.url.startsWith('/en/api/beta/current/'),
    ),
  );
  assert.ok(
    chinese.some(
      item =>
        item.name === '@example/alpha' &&
        item.sourceLocale === 'zh-CN' &&
        item.summary.includes('Alpha 中文包'),
    ),
  );
  assert.ok(
    chinese.some(
      item => item.name === '@example/beta' && item.sourceLocale === 'en',
    ),
  );
  assert.ok(
    chinese.some(item => item.name === '介绍' && item.category === 'manual'),
  );
  assert.deepEqual(counts, { en: english.length, 'zh-CN': chinese.length });
});

void test('runs search build from the mjs CLI', async t => {
  const values = await fixture(t);
  const cliPath = path.resolve(import.meta.dirname, '../bin/galacean-docs.mjs');
  const result = await execFileAsync(
    process.execPath,
    [cliPath, 'search', 'build', '--config', 'site/site.config.ts'],
    { cwd: values.repositoryRoot },
  );

  assert.match(result.stdout, /en: \d+ search results/u);
  assert.match(result.stdout, /zh-CN: \d+ search results/u);
  await readFile(path.join(values.outputDirectory, 'en.json'));
  await readFile(path.join(values.outputDirectory, 'zh-CN.json'));
});
