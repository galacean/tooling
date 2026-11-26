import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'vitest';
import type { TestContext } from 'vitest';
import { buildStaticRoutes, loadDocsProjectConfig } from '@galacean/docs-tools';

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
    '<script src="/docs/assets/app.js"></script></head><body><div id="root"></div></body></html>';

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
      translationDirectory: 'tmp/docs-tools',
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
      apiTranslationDirectory: path.join(
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
  assert.match(notFound, /<a href="\/docs\/">Home<\/a>/u);
  assert.equal(
    await readFile(path.join(values.distDirectory, '.nojekyll'), 'utf8'),
    '',
  );
});

void test('uses the shared home destination in the static 404 page', async t => {
  const values = await fixture(t);
  const configPath = path.join(values.repositoryRoot, 'docs.config.json');

  for (const [homeHref, expected] of [
    ['/start/', '/docs/start/'],
    ['https://example.com/?from=docs&lang=en', 'https://example.com/?from=docs&amp;lang=en'],
    ['//example.com/', '//example.com/'],
  ]) {
    await writeFile(configPath, JSON.stringify({
      siteName: 'Fixture Docs',
      sourceLocale: 'en',
      locales: ['en', 'zh-CN'],
      api: { dataDirectory: 'site/public/data/api' },
      manual: { dataDirectory: 'site/manual-content' },
      homeHref,
    }));
    const config = await loadDocsProjectConfig('docs.config.json', values.repositoryRoot);

    await buildStaticRoutes(config, { base: '/docs/' });
    const notFound = await readFile(path.join(values.distDirectory, '404.html'), 'utf8');

    assert.ok(notFound.includes(`<a href="${expected}">Home</a>`));
  }
});

void test('builds localized custom site pages with titles and static routes', async t => {
  const values = await fixture(t);
  const result = await buildStaticRoutes(
    {
      ...values.config,
      pages: [
        { slug: null },
        { slug: 'custom-page', title: { en: 'Custom page', 'zh-CN': '自定义页面' } },
      ],
    },
    { base: '/docs/', origin: 'https://example.test' },
  );
  const routes = JSON.parse(
    await readFile(path.join(values.distDirectory, 'routes.json'), 'utf8'),
  ) as string[];
  const english = await readFile(
    path.join(values.distDirectory, 'en/custom-page/index.html'),
    'utf8',
  );
  const chinese = await readFile(
    path.join(values.distDirectory, 'zh-CN/custom-page/index.html'),
    'utf8',
  );

  assert.equal(result.routes, 10);
  assert.ok(routes.includes('/en/custom-page/'));
  assert.ok(routes.includes('/zh-CN/custom-page/'));
  assert.match(english, /<title>Custom page \| Fixture Docs<\/title>/u);
  assert.match(chinese, /<title>自定义页面 \| Fixture Docs<\/title>/u);
  assert.match(english, /canonical[^>]+https:\/\/example\.test\/docs\/en\/custom-page\//u);
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
  assert.equal(await readFile(path.join(values.distDirectory, 'en/manual/intro/diagram.svg'), 'utf8'), '<svg/>');

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
  const configPath = path.join(values.repositoryRoot, 'site/site.config.ts');

  await writeFile(
    configPath,
    `export default ${JSON.stringify({
      siteName: 'Fixture Docs',
      sourceLocale: 'en',
      locales: ['en', 'zh-CN'],
      api: { dataDirectory: 'site/public/data/api' },
      manual: { dataDirectory: 'site/manual-content' },
      pages: [
        { slug: null },
        { slug: 'custom-page', title: { en: 'Custom page', 'zh-CN': '自定义页面' } },
      ],
      translationDirectory: 'tmp/docs-tools',
    })} as const;\n`,
  );

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

  assert.match(result.stdout, /Static routes: 10; .*base \/docs\//u);
  const html = await readFile(
    path.join(values.distDirectory, 'en/custom-page/index.html'),
    'utf8',
  );

  assert.match(html, /<title>Custom page \| Fixture Docs<\/title>/u);
  assert.match(html, /https:\/\/example\.test\/docs\/en\//u);
});

void test('generates metadata and sitemap entries without rendering route bodies', async t => {
  const values = await fixture(t);
  const config = {
    ...values.config,
    defaultLocale: 'zh-CN',
    pages: [
      { slug: null, seo: { description: { en: 'Project home', 'zh-CN': '项目首页' } } },
      { slug: 'about', title: { en: 'About', 'zh-CN': '关于' } },
      { slug: 'tool', title: { en: 'Tool', 'zh-CN': '工具' }, seo: { description: { en: 'A $& B tool' } } },
    ],
  };
  const template = await readFile(path.join(values.distDirectory, 'index.html'), 'utf8');

  await writeFile(path.join(values.distDirectory, 'index.html'), template.replace('</head>',
    '<title>Old title</title><meta name="description" content="Old description">' +
    '<link rel="alternate" type="application/rss+xml" href="https://example.test/feed.xml"></head>'));
  await buildStaticRoutes(config, { base: '/docs/', origin: 'https://example.test' });
  const read = (filename: string) => readFile(path.join(values.distDirectory, filename), 'utf8');
  const root = await read('index.html');
  const manual = await read('en/manual/intro/index.html');
  const sitemap = await read('sitemap.xml');

  for (const filename of ['index.html', 'en/index.html', 'en/manual/index.html',
    'en/manual/intro/index.html', 'en/about/index.html', 'zh-CN/about/index.html', 'en/tool/index.html']) {
    const html = await read(filename);

    assert.match(html, /<div id="root"><\/div>/u);
    assert.doesNotMatch(html, /<main|<h1|No local links/u);
    assert.equal(html.match(/<title>/gu)?.length, 1);
    assert.equal(html.match(/name="description"/gu)?.length, 1);
    assert.equal(html.match(/rel="canonical"/gu)?.length, 1);
  }
  assert.match(root, /<html lang="zh-CN" dir="ltr">/u);
  assert.equal(root, await read('zh-CN/index.html'));
  assert.match(root, /content="项目首页"/u);
  assert.match(root, /canonical[^>]+https:\/\/example.test\/docs\/zh-CN\//u);
  assert.match(root, /type="application\/rss\+xml"/u);
  assert.match(manual, /<title>Introduction \| Fixture Docs<\/title>/u);
  assert.match(manual, /content="Documentation and reference for Introduction\."/u);
  assert.match(await read('en/tool/index.html'), /content="A \$&amp; B tool"/u);
  for (const locale of config.locales) {
    for (const suffix of ['', 'about/', 'tool/', 'manual/', 'manual/intro/', 'api/']) {
      assert.ok(sitemap.includes(`<loc>https://example.test/docs/${locale}/${suffix}</loc>`));
    }
  }
  assert.doesNotMatch(sitemap, /\/404|<loc>https:\/\/example.test\/docs\/<\/loc>/u);
  assert.match(await read('404.html'), /name="robots" content="noindex"/u);
  await assert.rejects(read('robots.txt'), /ENOENT/u);

  await buildStaticRoutes(config, { base: '/docs/', origin: 'https://example.test' });
  assert.equal(await read('index.html'), root);
});

void test('preserves SVG titles and inline script text when replacing head metadata', async t => {
  const { config, distDirectory } = await fixture(t);
  const filename = path.join(distDirectory, 'index.html');
  const script = '<script>const markup = "<title>example</title>";</script>';
  const svg = '<svg><title>Brand icon</title></svg>';
  const template = (await readFile(filename, 'utf8'))
    .replace('</head>', script + '<meta name=description content="x > y"></head>')
    .replace('</body>', svg + '</body>');

  await writeFile(filename, template);
  await buildStaticRoutes(config, { base: '/docs/' });
  const html = await readFile(filename, 'utf8');

  assert.ok(html.includes(svg));
  assert.ok(html.includes(script));
  assert.doesNotMatch(html, /x > y/u);
});

void test('generates robots only at the origin root', async t => {
  const values = await fixture(t);

  await writeFile(path.join(values.distDirectory, 'index.html'),
    '<html><head></head><body><div id="root"></div></body></html>');
  await buildStaticRoutes(values.config, { base: '/', origin: 'https://example.test' });
  assert.match(await readFile(path.join(values.distDirectory, 'robots.txt'), 'utf8'),
    /Sitemap: https:\/\/example.test\/sitemap.xml/u);
  await buildStaticRoutes(values.config, { base: '/docs/', origin: 'https://example.test' });
  await assert.rejects(readFile(path.join(values.distDirectory, 'robots.txt')), /ENOENT/u);
  assert.match(await readFile(path.join(values.distDirectory, 'sitemap.xml'), 'utf8'), /\/docs\/en\//u);
  await buildStaticRoutes(values.config, { base: '/' });
  await assert.rejects(readFile(path.join(values.distDirectory, 'sitemap.xml')), /ENOENT/u);
  await assert.rejects(readFile(path.join(values.distDirectory, 'robots.txt')), /ENOENT/u);
});

void test('lists package entries without reading README data and excludes symbol aliases from sitemap', async t => {
  const values = await fixture(t);
  const entries = [{
    key: 'root', source: 'src/index.ts', types: 'dist/index.d.ts', id: 1,
    symbols: [{ name: 'parse', id: 2, kind: 64 }, { name: 'Parse', id: 3, kind: 64 }],
  }];
  const version = {
    version: '1.0.0', snapshot: 'a'.repeat(64), commit: 'revision', entries,
    json: { en: 'engine/1.0.0/en.api.json', 'zh-CN': 'engine/1.0.0/zh-CN.api.json' },
  };
  const pkg = {
    key: 'engine', name: '@example/engine', latestVersion: '1.0.0', entries,
    current: { ...version, version: 'current', packageVersion: '1.0.0' }, versions: [version],
  };

  await writeFile(path.join(values.repositoryRoot, 'site/public/data/api/manifest.json'), JSON.stringify({
    schemaVersion: 2, defaultVersion: 'current', packages: [pkg],
  }));
  await buildStaticRoutes(values.config, { base: '/docs/', origin: 'https://example.test' });
  const html = await readFile(path.join(values.distDirectory, 'en/api/engine/index.html'), 'utf8');
  const sitemap = await readFile(path.join(values.distDirectory, 'sitemap.xml'), 'utf8');
  const symbol = await readFile(path.join(values.distDirectory, 'en/api/engine/current/parse--70-61-72-73-65/index.html'), 'utf8');

  assert.match(html, /<title>@example\/engine \| Fixture Docs<\/title>/u);
  assert.match(html, /<div id="root"><\/div>/u);
  assert.match(sitemap, /\/en\/api\/engine\//u);
  assert.doesNotMatch(sitemap, /current|1\.0\.0/u);
  assert.match(symbol, /<div id="root"><\/div>/u);
  assert.match(symbol, /<title>parse \| Fixture Docs<\/title>/u);
});
