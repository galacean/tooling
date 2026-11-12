import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'vitest';
import type { TestContext } from 'vitest';
import { buildStaticRoutes } from '@galacean/docs-tools';

const execFileAsync = promisify(execFile);

async function fixture(t: TestContext) {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'docs-static-routes-'),
  );
  const distDirectory = path.join(repositoryRoot, 'site/dist');
  const dataDirectory = path.join(repositoryRoot, 'site/public/data');
  const apiDirectory = path.join(dataDirectory, 'api');
  const manualDirectory = path.join(repositoryRoot, 'site/manual-content');
  const searchDirectory = path.join(dataDirectory, 'search');
  const template =
    '<html lang="zh-CN"><head><link rel="icon" href="/docs/favicon.svg">' +
    '<script src="/docs/assets/app.js"></script></head><body></body></html>';

  await mkdir(path.join(distDirectory, 'assets'), { recursive: true });
  await mkdir(path.join(manualDirectory, 'en'), { recursive: true });
  await mkdir(path.join(manualDirectory, 'zh-CN'), { recursive: true });
  await mkdir(searchDirectory, { recursive: true });
  await mkdir(apiDirectory, { recursive: true });
  await writeFile(path.join(distDirectory, 'index.html'), template);
  await writeFile(path.join(distDirectory, 'favicon.svg'), '<svg/>');
  await writeFile(path.join(distDirectory, 'assets/app.js'), '');
  await writeFile(
    path.join(apiDirectory, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 2,
      defaultVersion: 'current',
      packages: [],
    }),
  );
  await writeFile(
    path.join(repositoryRoot, 'site/site.config.ts'),
    `export default ${JSON.stringify({
      siteName: 'Fixture Docs',
      sourceLocale: 'en',
      locales: ['en', 'zh-CN'],
      api: { dataDirectory: 'site/public/data/api' },
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
  for (const locale of ['en', 'zh-CN']) {
    await writeFile(
      path.join(searchDirectory, `${locale}.json`),
      JSON.stringify([{ url: `/${locale}/manual/intro/` }]),
    );
    await writeFile(
      path.join(manualDirectory, locale, 'intro.md'),
      '# Intro\n\nNo local links.\n',
    );
  }
  t.onTestFinished(() => rm(repositoryRoot, { recursive: true, force: true }));

  return {
    repositoryRoot,
    distDirectory,
    manualDirectory,
    config: {
      repositoryRoot,
      configPath: path.join(repositoryRoot, 'site/site.config.ts'),
      sourceLocale: 'en',
      locales: ['en', 'zh-CN'],
      apiDirectory,
      manualDirectory,
      translationWorkDirectory: path.join(
        repositoryRoot,
        'tmp/docs-tools/api-translation',
      ),
      siteName: 'Fixture Docs',
    },
  };
}

void test('builds localized deep links and validates a subpath artifact', async t => {
  const values = await fixture(t);
  const result = await buildStaticRoutes(values.config, {
    base: '/docs/',
    origin: 'https://example.test',
  });
  const routes = JSON.parse(
    await readFile(path.join(values.distDirectory, 'routes.json'), 'utf8'),
  ) as string[];
  const english = await readFile(
    path.join(values.distDirectory, 'en/index.html'),
    'utf8',
  );
  const notFound = await readFile(
    path.join(values.distDirectory, '404.html'),
    'utf8',
  );

  assert.equal(result.routes, 8);
  assert.ok(result.bytes > 0);
  assert.ok(routes.includes('/en/manual/intro/'));
  assert.match(english, /canonical[^>]+https:\/\/example\.test\/docs\/en\//u);
  assert.match(
    english,
    /hreflang="zh-CN" href="https:\/\/example\.test\/docs\/zh-CN\//u,
  );
  assert.match(notFound, /Fixture Docs/u);
  assert.equal(
    await readFile(path.join(values.distDirectory, '.nojekyll'), 'utf8'),
    '',
  );
});

void test('builds manual routes without API configuration or an API manifest', async t => {
  const values = await fixture(t);
  const searchDirectory = path.join(
    path.dirname(values.config.manualDirectory),
    'search',
  );
  const manifestDirectory = path.dirname(values.config.apiDirectory);

  await mkdir(searchDirectory, { recursive: true });
  for (const locale of ['en', 'zh-CN']) {
    await writeFile(
      path.join(searchDirectory, `${locale}.json`),
      JSON.stringify([{ url: `/${locale}/manual/intro/` }]),
    );
  }
  await rm(path.join(manifestDirectory, 'api'), {
    recursive: true,
    force: true,
  });
  const result = await buildStaticRoutes(
    { ...values.config, apiConfigured: false },
    { base: '/docs/' },
  );
  const routes = JSON.parse(
    await readFile(path.join(values.distDirectory, 'routes.json'), 'utf8'),
  ) as string[];

  assert.equal(result.routes, 6);
  assert.ok(routes.includes('/en/manual/intro/'));
  assert.ok(!routes.includes('/en/api/'));
});

void test('builds API routes without manual configuration or navigation', async t => {
  const values = await fixture(t);
  const manualDirectory = path.join(
    path.dirname(values.config.apiDirectory),
    'manual',
  );
  const searchDirectory = path.dirname(values.config.apiDirectory);

  await rm(values.manualDirectory, { recursive: true, force: true });
  await mkdir(path.join(searchDirectory, 'search'), { recursive: true });
  for (const locale of ['en', 'zh-CN']) {
    await writeFile(
      path.join(searchDirectory, 'search', `${locale}.json`),
      '[]\n',
    );
  }
  const result = await buildStaticRoutes(
    { ...values.config, manualDirectory, manualConfigured: false },
    { base: '/docs/' },
  );
  const routes = JSON.parse(
    await readFile(path.join(values.distDirectory, 'routes.json'), 'utf8'),
  ) as string[];

  assert.equal(result.routes, 4);
  assert.ok(routes.includes('/en/api/'));
  assert.ok(!routes.includes('/en/manual/'));
});

void test('requires linked manual images to exist inside the locale manual directory', async t => {
  const values = await fixture(t);
  const manualDirectory = path.join(values.manualDirectory, 'en/intro');
  const manualPath = path.join(values.manualDirectory, 'en/intro.md');

  await mkdir(manualDirectory, { recursive: true });
  await writeFile(path.join(manualDirectory, 'diagram.svg'), '<svg/>');
  await writeFile(manualPath, '# Intro\n\n![Diagram](diagram.svg)\n');
  await buildStaticRoutes(values.config, { base: '/docs/' });

  await rm(path.join(manualDirectory, 'diagram.svg'));
  await assert.rejects(
    buildStaticRoutes(values.config, { base: '/docs/' }),
    /Manual asset does not exist/u,
  );
});

void test('validates HTML manual image assets under the locale manual directory', async t => {
  const values = await fixture(t);
  const manualRoot = values.manualDirectory;
  const navigationPath = path.join(manualRoot, 'navigation.json');
  const navigation = JSON.parse(await readFile(navigationPath, 'utf8')) as {
    slug: string;
    title: Record<string, string>;
    group: Record<string, string>;
  }[];

  await writeFile(
    navigationPath,
    JSON.stringify([
      {
        ...navigation[0],
        format: { en: 'html', 'zh-CN': 'markdown' },
      },
    ]),
  );
  await mkdir(path.join(manualRoot, 'en/intro'), { recursive: true });
  await writeFile(
    path.join(manualRoot, 'en/intro.html'),
    '<article><h1>Intro</h1><img src="diagram.svg" alt="Diagram"></article>',
  );
  await writeFile(path.join(manualRoot, 'en/intro/diagram.svg'), '<svg/>');

  await buildStaticRoutes(values.config, { base: '/docs/' });

  await rm(path.join(manualRoot, 'en/intro/diagram.svg'));
  await assert.rejects(
    buildStaticRoutes(values.config, { base: '/docs/' }),
    /Manual asset does not exist/u,
  );
});

void test('does not validate custom data-video-src attributes as local assets', async t => {
  const values = await fixture(t);
  const manualRoot = values.manualDirectory;
  const navigationPath = path.join(manualRoot, 'navigation.json');
  const navigation = JSON.parse(await readFile(navigationPath, 'utf8')) as {
    slug: string;
    title: Record<string, string>;
    group: Record<string, string>;
  }[];

  await writeFile(
    navigationPath,
    JSON.stringify([
      {
        ...navigation[0],
        format: { en: 'html', 'zh-CN': 'markdown' },
      },
    ]),
  );
  await writeFile(
    path.join(manualRoot, 'en/intro.html'),
    '<article data-video-src="inputs/prod/yuque/missing.mp4"></article>',
  );

  await buildStaticRoutes(values.config, { base: '/docs/' });
});

void test('rejects invalid bases and unmaterialized search routes', async t => {
  const values = await fixture(t);

  await assert.rejects(
    buildStaticRoutes(values.config, { base: '../escape' }),
    /Invalid static site base/u,
  );
  await writeFile(
    path.join(values.repositoryRoot, 'site/public/data/search/en.json'),
    JSON.stringify([{ url: '/en/api/missing/' }]),
  );
  await assert.rejects(
    buildStaticRoutes(values.config),
    /Search route has no static entry/u,
  );
});

void test('runs routes build from the mjs CLI with deployment environment', async t => {
  const values = await fixture(t);
  const cliPath = path.resolve(import.meta.dirname, '../bin/galacean-docs.mjs');
  const result = await execFileAsync(
    process.execPath,
    [cliPath, 'routes', 'build', '--config', 'site/site.config.ts'],
    {
      cwd: values.repositoryRoot,
      env: {
        ...process.env,
        SITE_BASE_PATH: '/docs/',
        VITE_SITE_ORIGIN: 'https://example.test',
      },
    },
  );

  assert.match(result.stdout, /Static routes: 8; .*base \/docs\//u);
  const html = await readFile(
    path.join(values.distDirectory, 'en/index.html'),
    'utf8',
  );

  assert.match(html, /https:\/\/example\.test\/docs\/en\//u);
});
