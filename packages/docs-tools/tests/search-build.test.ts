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
  const manualDirectory = path.join(repositoryRoot, 'site/manual-content');
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
      api: {
        dataDirectory: 'site/public/data/api',
        packages: [
          {
            key: 'alpha',
            name: '@example/alpha',
            directory: 'packages/alpha',
            tsconfig: 'tsconfig.json',
            entries: [
              {
                key: 'root',
                source: 'src/index.ts',
                types: 'dist/index.d.ts',
              },
            ],
            readme: {
              files: {
                en: 'README.md',
                'zh-CN': 'README-zh_CN.md',
              },
            },
          },
          {
            key: 'beta',
            name: '@example/beta',
            directory: 'packages/beta',
            tsconfig: 'tsconfig.json',
            entries: [
              {
                key: 'root',
                source: 'src/index.ts',
                types: 'dist/index.d.ts',
              },
            ],
            readme: { files: { en: 'README.md' } },
          },
        ],
      },
      manual: { dataDirectory: 'site/manual-content' },
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
    manualDirectory,
    outputDirectory: path.join(dataDirectory, 'search'),
    config: {
      repositoryRoot,
      configPath: path.join(repositoryRoot, 'site/site.config.ts'),
      sourceLocale: 'en',
      locales,
      apiDirectory,
      manualDirectory,
      translationWorkDirectory: path.join(
        repositoryRoot,
        'tmp/docs-tools/api-translation',
      ),
      apiPackages: [
        {
          key: 'alpha',
          name: '@example/alpha',
          directory: path.join(repositoryRoot, 'packages/alpha'),
          tsconfig: path.join(repositoryRoot, 'packages/alpha/tsconfig.json'),
          entries: [],
          readme: {
            files: {
              en: path.join(repositoryRoot, 'packages/alpha/README.md'),
              'zh-CN': path.join(
                repositoryRoot,
                'packages/alpha/README-zh_CN.md',
              ),
            },
          },
        },
        {
          key: 'beta',
          name: '@example/beta',
          directory: path.join(repositoryRoot, 'packages/beta'),
          tsconfig: path.join(repositoryRoot, 'packages/beta/tsconfig.json'),
          entries: [],
          readme: {
            files: {
              en: path.join(repositoryRoot, 'packages/beta/README.md'),
            },
          },
        },
      ],
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

void test('builds manual-only indexes without an API manifest and accepts short pages', async t => {
  const values = await fixture(t);
  const manualOnlyConfig = { ...values.config, apiConfigured: false };
  const outputDirectory = path.join(
    path.dirname(values.manualDirectory),
    'search',
  );

  Reflect.deleteProperty(manualOnlyConfig, 'apiPackages');
  await rm(path.join(values.apiDirectory, 'manifest.json'));
  await writeFile(
    path.join(values.manualDirectory, 'en/intro.md'),
    '# Introduction\n\nA short manual page.\n',
  );
  await writeFile(
    path.join(values.manualDirectory, 'zh-CN/intro.md'),
    '# 介绍\n\n简短手册内容。\n',
  );

  const counts = await buildSearchIndexes(manualOnlyConfig);
  const english = JSON.parse(
    await readFile(path.join(outputDirectory, 'en.json'), 'utf8'),
  ) as { category: string; name: string; url: string }[];
  const chinese = JSON.parse(
    await readFile(path.join(outputDirectory, 'zh-CN.json'), 'utf8'),
  ) as { category: string; name: string; url: string }[];

  assert.deepEqual(counts, { en: 1, 'zh-CN': 1 });
  assert.deepEqual(english, [
    {
      category: 'manual',
      name: 'Introduction',
      summary: 'Introduction A short manual page.',
      keywords: 'Introduction A short manual page.',
      sourceLocale: 'en',
      url: '/en/manual/intro/',
    },
  ]);
  assert.equal(chinese[0]?.category, 'manual');
  assert.equal(chinese[0]?.name, '介绍');
});

void test('indexes text from HTML manuals without changing their display format', async t => {
  const values = await fixture(t);
  const manualOnlyConfig = { ...values.config };

  Reflect.deleteProperty(manualOnlyConfig, 'apiPackages');
  await rm(path.join(values.apiDirectory, 'manifest.json'));
  await writeFile(
    path.join(values.manualDirectory, 'navigation.json'),
    JSON.stringify([
      {
        slug: 'intro',
        title: { en: 'Introduction', 'zh-CN': '介绍' },
        group: { en: 'Start', 'zh-CN': '开始' },
        format: { en: 'html', 'zh-CN': 'markdown' },
      },
    ]),
  );
  await writeFile(
    path.join(values.manualDirectory, 'en/intro.html'),
    '<article><h1>Introduction</h1><p>HTML body is searchable.</p></article>',
  );

  await buildSearchIndexes(manualOnlyConfig);

  const english = JSON.parse(
    await readFile(path.join(values.outputDirectory, 'en.json'), 'utf8'),
  ) as { category: string; name: string; summary: string; keywords: string }[];

  assert.equal(english.length, 1);
  assert.equal(english[0]?.name, 'Introduction');
  assert.match(english[0]?.summary ?? '', /HTML body is searchable/u);
  assert.doesNotMatch(english[0]?.summary ?? '', /<\/?(?:article|p|h1)/iu);
  assert.doesNotMatch(english[0]?.keywords ?? '', /<\/?(?:article|p|h1)/iu);
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
