import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'vitest';
import type { TestContext } from 'vitest';
import { buildPackageReadmes } from '@galacean/docs-tools';

const execFileAsync = promisify(execFile);

async function fixture(t: TestContext) {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'docs-package-readmes-'),
  );
  const apiDirectory = path.join(repositoryRoot, 'site/public/data/api');
  const alphaDirectory = path.join(repositoryRoot, 'packages/alpha');
  const betaDirectory = path.join(repositoryRoot, 'packages/beta');
  const alphaEnglish = path.join(alphaDirectory, 'README.md');
  const alphaChinese = path.join(alphaDirectory, 'README-zh_CN.md');
  const betaEnglish = path.join(betaDirectory, 'README.md');
  const pkg = (key: string) => {
    const versionInfo = {
      version: '1.0.0',
      snapshot: 'a'.repeat(64),
      commit: 'fixture',
      entries: [],
      json: {
        en: `api/${key}/1.0.0/en.api.json`,
        'zh-CN': `api/${key}/1.0.0/zh-CN.api.json`,
      },
    };

    return {
      key,
      name: `@example/${key}`,
      latestVersion: '1.0.0',
      entries: [],
      current: { ...versionInfo, version: 'current', packageVersion: '1.0.0' },
      versions: [versionInfo],
    };
  };

  await mkdir(apiDirectory, { recursive: true });
  await mkdir(alphaDirectory, { recursive: true });
  await mkdir(betaDirectory, { recursive: true });
  await writeFile(
    path.join(apiDirectory, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 2,
      defaultVersion: 'current',
      packages: [pkg('alpha'), pkg('beta')],
    }),
  );
  await writeFile(alphaEnglish, '# Alpha\n\nEnglish alpha README.\n');
  await writeFile(alphaChinese, '# Alpha 中文\n\n中文 alpha README。\n');
  await writeFile(betaEnglish, '# Beta\n\nEnglish beta README.\n');
  await writeFile(
    path.join(repositoryRoot, 'site/site.config.ts'),
    `export default ${JSON.stringify({
      sourceLocale: 'zh-CN',
      locales: ['en', 'zh-CN'],
      api: { dataDirectory: 'site/public/data/api' },
      packageReadmeSourceLocales: { beta: 'en' },
      packageReadmes: {
        alpha: {
          en: 'packages/alpha/README.md',
          'zh-CN': 'packages/alpha/README-zh_CN.md',
        },
        beta: { en: 'packages/beta/README.md' },
      },
    })} as const;\n`,
  );
  t.onTestFinished(() => rm(repositoryRoot, { recursive: true, force: true }));

  return {
    repositoryRoot,
    outputDirectory: path.join(
      repositoryRoot,
      'site/public/data/package-readmes',
    ),
    config: {
      repositoryRoot,
      configPath: path.join(repositoryRoot, 'site/site.config.ts'),
      sourceLocale: 'zh-CN',
      locales: ['en', 'zh-CN'],
      apiDirectory,
      translationWorkDirectory: path.join(
        repositoryRoot,
        'tmp/docs-tools/api-translation',
      ),
      packageReadmes: {
        alpha: { en: alphaEnglish, 'zh-CN': alphaChinese },
        beta: { en: betaEnglish },
      },
      packageReadmeSourceLocales: { beta: 'en' },
    },
  };
}

void test('builds localized README data and falls back to the configured source locale', async t => {
  const values = await fixture(t);
  const counts = await buildPackageReadmes(values.config);
  const alphaChinese = JSON.parse(
    await readFile(
      path.join(values.outputDirectory, 'alpha/zh-CN.json'),
      'utf8',
    ),
  );
  const betaChinese = JSON.parse(
    await readFile(
      path.join(values.outputDirectory, 'beta/zh-CN.json'),
      'utf8',
    ),
  );

  assert.deepEqual(counts, { en: 2, 'zh-CN': 2 });
  assert.equal(alphaChinese.sourceLocale, 'zh-CN');
  assert.match(alphaChinese.text, /Alpha 中文/u);
  assert.equal(betaChinese.sourceLocale, 'en');
  assert.match(betaChinese.text, /English beta README/u);
});

void test('runs package-readmes build from the mjs CLI', async t => {
  const values = await fixture(t);
  const cliPath = path.resolve(import.meta.dirname, '../bin/galacean-docs.mjs');
  const result = await execFileAsync(
    process.execPath,
    [cliPath, 'package-readmes', 'build', '--config', 'site/site.config.ts'],
    { cwd: values.repositoryRoot },
  );

  assert.match(result.stdout, /en: 2 package READMEs/u);
  await readFile(path.join(values.outputDirectory, 'alpha/en.json'));
});
