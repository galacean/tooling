import { readPackageReadme } from '../src/package-readmes/read';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test, vi } from 'vitest';
import * as atomic from '../src/atomic-write';
import { builtInLocales } from '@galacean/docs-site';
import {
  applyDocumentTranslations, extractDocumentTranslations, getDocumentTranslationStatus,
  loadDocsProjectConfig, parseTranslationSelection, syncManuals, validateDocumentTranslation,
  buildSearchIndexes, buildStaticRoutes,
} from '@galacean/docs-tools';

const execute = promisify(execFile);

async function fixture(t: { onTestFinished: (callback: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-multilingual-'));

  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'content/en'), { recursive: true });
  await writeFile(path.join(root, 'content/navigation.json'), JSON.stringify([{ slug: 'guide', title: { en: 'Guide' }, group: { en: 'Start' } }]));
  const content = '# Guide\n\nUse `Widget` and [docs](https://example.com).\n';

  await writeFile(path.join(root, 'content/en/guide.md'), content);
  await writeFile(path.join(root, 'docs.json'), JSON.stringify({ sourceLocale: 'en', locales: builtInLocales,
    manual: { dataDirectory: 'output/manual', collections: [{ key: 'guides', source: { type: 'local', directory: 'content', locale: 'en' } }] } }));
  const config = await loadDocsProjectConfig('docs.json', root);

  return { root: config.repositoryRoot, config, content };
}

test('source-only local manuals expand to all languages, apply selected translations and rebuild from archives', async t => {
  const { root, config, content } = await fixture(t);

  await syncManuals(config);
  const navigation = JSON.parse(await readFile(path.join(config.manualDirectory, 'navigation.json'), 'utf8')) as { contentLocales: Record<string, string>; translationStatus: Record<string, string> }[];

  assert.equal(navigation[0]?.contentLocales['ar'], 'en');
  assert.equal(navigation[0]?.translationStatus['ar'], 'missing');
  assert.equal(await readFile(path.join(config.manualDirectory, 'th/guide.md'), 'utf8'), content);
  const preview = await extractDocumentTranslations('manual', config, { targetLocales: 'all', dryRun: true });

  assert.equal(preview.length, 13);
  await assert.rejects(stat(path.join(root, 'tmp/docs-tools/manual-translation')), { code: 'ENOENT' });
  const [task] = await extractDocumentTranslations('manual', config, { sourceLocale: 'en', targetLocales: ['ja'] });

  assert.ok(task);
  const input = JSON.parse(await readFile(task.taskPath, 'utf8')) as { sourceHash: string };
  const translationPath = path.join(path.dirname(task.taskPath), 'ja.json');
  const translated = '# ガイド\n\n`Widget` と [ドキュメント](https://example.com) を使用します。\n';

  await writeFile(translationPath, JSON.stringify({ locale: 'ja', sourceHash: input.sourceHash, content: translated, title: 'ガイド', group: 'はじめに' }));
  await applyDocumentTranslations('manual', config, [{ taskPath: task.taskPath, translationPath }]);
  await rm(config.manualDirectory, { recursive: true });
  await syncManuals(config);
  assert.equal(await readFile(path.join(config.manualDirectory, 'ja/guide.md'), 'utf8'), translated);
  assert.equal((await extractDocumentTranslations('manual', config, { targetLocales: ['ja'], dryRun: true })).length, 0);
  await writeFile(path.join(root, 'content/en/guide.md'), content + '\nChanged source.\n');
  const [status] = await getDocumentTranslationStatus('manual', config, { targetLocales: ['ja'] });

  assert.equal(status?.translation.status, 'needs-review');
  await assert.rejects(applyDocumentTranslations('manual', config, [{ taskPath: task.taskPath, translationPath }]), /Stale document task/u);
  await syncManuals(config);
  assert.match(await readFile(path.join(config.manualDirectory, 'ja/guide.md'), 'utf8'), /Changed source/u);
});

test('selection parsing rejects conflicts and validates the actual source', async t => {
  const { config } = await fixture(t);

  assert.deepEqual(parseTranslationSelection(['--source-locale', 'en', '--target-locales', 'ja,ko', '--dry-run']).options,
    { sourceLocale: 'en', targetLocales: ['ja', 'ko'], dryRun: true });
  assert.throws(() => parseTranslationSelection(['--locale', 'ja', '--target-locales', 'ko']), /conflicting/u);
  assert.throws(() => parseTranslationSelection(['--target-locales', 'ja,,ko']), /Empty/u);
  await assert.rejects(extractDocumentTranslations('manual', config, { sourceLocale: 'ja' }), /actual sources: en/u);
  await assert.rejects(extractDocumentTranslations('manual', config, { targetLocales: ['it'] }), /configured locales/u);
});

test('protected HTML/Markdown structure and translated anchors are validated', () => {
  const source = '<p class="intro">Hello <code>Widget</code></p><img src="image.png">';

  validateDocumentTranslation(source, '<p class="intro">こんにちは <code>Widget</code></p><img src="image.png">', 'html');
  assert.throws(() => validateDocumentTranslation(source, source.replace('image.png', 'other.png'), 'html'), /protected/u);
  assert.throws(() => validateDocumentTranslation(source, source.replace('Widget', 'Other'), 'html'), /protected/u);
  validateDocumentTranslation('# Guide\n\n[Next](#guide)\n', '# ガイド\n\n[次へ](#ガイド)\n', 'markdown');
  assert.throws(() => validateDocumentTranslation('# Guide\n\n[Next](#guide)\n', '# ガイド\n\n[次へ](#guide)\n', 'markdown'), /anchor/u);
  assert.throws(() => validateDocumentTranslation('```ts\nWidget();\n```', '```ts\nOther();\n```', 'markdown'), /protected/u);
});

test('inline URLs stop at code delimiters before translated punctuation and prose', () => {
  const source = '打开 `http://localhost:8080`。工作台只通过开发服务使用。\n';
  const target = 'Open `http://localhost:8080`. Use the development server.\n';

  validateDocumentTranslation(source, target, 'markdown');
  assert.throws(() => validateDocumentTranslation(source, target.replace('8080', '8081'), 'markdown'), /protected/u);
});

test('locale normalization catches collisions while preserving configured filename mappings', async t => {
  const { root } = await fixture(t);

  await writeFile(path.join(root, 'duplicates.json'), JSON.stringify({ sourceLocale: 'fr', locales: ['FR', 'fr'] }));
  await assert.rejects(loadDocsProjectConfig('duplicates.json', root), /duplicates/u);
  await writeFile(path.join(root, 'canonical.json'), JSON.stringify({ sourceLocale: 'FR', locales: ['FR', 'JA'], defaultLocale: 'JA' }));
  const config = await loadDocsProjectConfig('canonical.json', root);

  assert.equal(config.sourceLocale, 'fr');
  assert.equal(config.defaultLocale, 'ja');
  assert.deepEqual(config.locales, ['fr', 'ja']);
});

test('CLI previews every target and completeness check returns a failing exit status', async t => {
  const { root } = await fixture(t);
  const cli = path.resolve(import.meta.dirname, '../bin/galacean-docs.mjs');
  const preview = await execute(process.execPath, [cli, 'manual', 'extract', '--config', 'docs.json', '--source-locale', 'all', '--target-locales', 'all', '--dry-run'], { cwd: root });

  assert.match(preview.stdout, /13 pending/u);
  await assert.rejects(execute(process.execPath, [cli, 'translations', 'check', '--config', 'docs.json', '--require-complete'], { cwd: root }),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 1);
}, 15_000);

test('mixed-source collections compute all targets per document', async t => {
  const { root, config } = await fixture(t);

  await mkdir(path.join(root, 'chinese/zh-CN'), { recursive: true });
  await writeFile(path.join(root, 'chinese/navigation.json'), JSON.stringify([{ slug: 'start', title: { 'zh-CN': '开始' }, group: { 'zh-CN': '指南' } }]));
  await writeFile(path.join(root, 'chinese/zh-CN/start.md'), '# 开始\n\n中文内容。\n');
  config.manuals!.push({ key: 'chinese', source: { type: 'local', directory: path.join(root, 'chinese'), locale: 'zh-CN' } });
  const statuses = await getDocumentTranslationStatus('manual', config, { sourceLocale: 'all', targetLocales: ['en', 'zh-CN'] });

  assert.deepEqual(statuses.map(item => [item.document.sourceLocale, item.locale]), [['en', 'zh-CN'], ['zh-CN', 'en']]);
});

test('README translations are archived, restored and invalidated by source changes', async t => {
  const { root, config } = await fixture(t);
  const filename = path.join(root, 'README-custom.md');

  await writeFile(filename, '# Widget\n\nUse `Widget`.\n');
  config.apiPackages = [{ key: 'widget', name: '@example/widget', directory: root, tsconfig: path.join(root, 'tsconfig.json'), entries: [],
    readme: { sourceLocale: 'en', files: { en: filename } } }];
  const [task] = await extractDocumentTranslations('package-readmes', config, { targetLocales: ['ja'] });

  assert.ok(task);
  const input = JSON.parse(await readFile(task.taskPath, 'utf8')) as { sourceHash: string };
  const translationPath = path.join(path.dirname(task.taskPath), 'result.json');
  const content = '# Widget\n\n`Widget` を使用します。\n';

  await writeFile(translationPath, JSON.stringify({ locale: 'ja', sourceHash: input.sourceHash, content, title: 'Widget', group: '' }));
  await applyDocumentTranslations('package-readmes', config, [{ taskPath: task.taskPath, translationPath }]);
  assert.deepEqual(await readPackageReadme(config, 'widget', 'ja'), { text: content, sourceLocale: 'ja' });
  await writeFile(filename, '# Widget\n\nNew source.\n');
  assert.equal((await readPackageReadme(config, 'widget', 'ja')).sourceLocale, 'en');
});

test('builds all language search/routes with truthful fallback and localized RTL error pages', async t => {
  const { root, config } = await fixture(t);

  config.siteName = 'Multilingual docs';
  config.defaultLocale = 'ar';
  await mkdir(path.join(root, 'content/en/assets'), { recursive: true });
  await writeFile(path.join(root, 'content/en/assets/figure.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(path.join(root, 'content/en/guide.md'), '# Guide\n\n![Figure](../assets/figure.svg "Diagram")\n');
  await syncManuals(config);
  await buildSearchIndexes(config);
  const search = JSON.parse(await readFile(path.join(root, 'output/search/ja.json'), 'utf8')) as { sourceLocale: string }[];

  assert.ok(search.length > 0);
  assert.ok(search.every(item => item.sourceLocale === 'en'));
  await mkdir(path.join(root, 'site/dist'), { recursive: true });
  await writeFile(path.join(root, 'site/dist/index.html'), '<html><head></head><body><div id="root"></div></body></html>');
  await buildStaticRoutes(config, { origin: 'https://example.test', base: '/docs/' });
  const read = (filename: string) => readFile(path.join(root, 'site/dist', filename), 'utf8');
  const arabic = await read('ar/manual/guide/index.html');

  assert.match(arabic, /lang="ar" dir="rtl"/u);
  assert.match(arabic, /hreflang="en"/u);
  assert.doesNotMatch(arabic, /hreflang="ja"/u);
  assert.match(await read('ar/404.html'), /الصفحة غير موجودة/u);
  assert.match(await read('404.html'), /lang="ar" dir="rtl"/u);
  assert.match(await read('th/manual/index.html'), /คู่มือ/u);
  assert.equal(await read('ar/manual/assets/figure.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
});

test('failed archive commits preserve the previous body and metadata and allow retry', async t => {
  const { root, config, content } = await fixture(t);
  const translate = async () => {
    const [task] = await extractDocumentTranslations('manual', config, { targetLocales: ['ja'] });

    assert.ok(task);
    const input = JSON.parse(await readFile(task.taskPath, 'utf8')) as { sourceHash: string; content: string };
    const translationPath = path.join(path.dirname(task.taskPath), 'result.json');

    await writeFile(translationPath, JSON.stringify({ locale: 'ja', sourceHash: input.sourceHash,
      content: input.content.replace('# Guide', '# ガイド'), title: 'ガイド', group: 'はじめに' }));

    return { taskPath: task.taskPath, translationPath };
  };
  const [filename] = await applyDocumentTranslations('manual', config, [await translate()]);

  assert.ok(filename);
  const body = await readFile(filename, 'utf8');
  const metadata = await readFile(`${filename}.meta.json`, 'utf8');

  await writeFile(path.join(root, 'content/en/guide.md'), content + '\nChanged prose.\n');
  const pair = await translate();
  const original = atomic.writeFileAtomically;
  const writer = vi.spyOn(atomic, 'writeFileAtomically');

  writer.mockImplementationOnce(original).mockRejectedValueOnce(new Error('simulated navigation write failure'));
  try {
    await assert.rejects(applyDocumentTranslations('manual', config, [pair]), /simulated/u);
  } finally {
    writer.mockRestore();
  }
  assert.equal(await readFile(filename, 'utf8'), body);
  assert.equal(await readFile(`${filename}.meta.json`, 'utf8'), metadata);
  await applyDocumentTranslations('manual', config, [pair]);
  assert.match(await readFile(filename, 'utf8'), /Changed prose/u);
});

test('repeated in-place sync preserves edits and refreshes generated bodies, navigation and assets', async t => {
  const { config, root } = await fixture(t);
  const directory = path.join(root, 'content');
  const source = '# Guide\n\n![Figure](../assets/figure.svg)\n';
  const read = (relative: string) => readFile(path.join(directory, relative), 'utf8');
  const write = (relative: string, value: string) => writeFile(path.join(directory, relative), value);

  config.manualDirectory = directory;
  config.locales = ['en', 'ja', 'de'];
  await write('navigation.json', JSON.stringify([{ slug: 'guide', source: { type: 'local' }, title: { en: 'Guide' }, group: { en: 'Start' } }]));
  await mkdir(path.join(directory, 'en/assets'));
  await write('en/assets/figure.svg', '<svg>first</svg>');
  await write('en/guide.md', source);
  await syncManuals(config);

  const tasks = await extractDocumentTranslations('manual', config);

  assert.deepEqual(tasks.map(task => task.locale), ['ja', 'de']);
  const apply = async (task: typeof tasks[number]) => {
    const { sourceHash } = JSON.parse(await readFile(task.taskPath, 'utf8')) as { sourceHash: string };
    const result = path.join(path.dirname(task.taskPath), task.locale + '.json');

    await writeFile(result, JSON.stringify({ locale: task.locale, sourceHash, title: 'ガイド', group: '基本', content: source.replace('Guide', 'ガイド') }));

    return applyDocumentTranslations('manual', config, [{ taskPath: task.taskPath, translationPath: result }]);
  };

  await write('de/guide.md', source.replace('Guide', 'Anleitung'));
  await write('de/assets/figure.svg', '<svg>Deutsch</svg>');
  await write('en/assets/figure.svg', '<svg>second</svg>');
  await assert.rejects(apply(tasks[1]!), /maintained target file/u);
  await apply(tasks[0]!);
  await syncManuals(config);
  await syncManuals(config);
  assert.match(await read('ja/guide.md'), /ガイド/u);
  assert.match(await read('de/guide.md'), /Anleitung/u);
  assert.equal(await read('ja/assets/figure.svg'), '<svg>second</svg>');
  assert.equal(await read('de/assets/figure.svg'), '<svg>Deutsch</svg>');
  const navigation = JSON.parse(await read('navigation.json')) as { title: Record<string, string>; group: Record<string, string> }[];

  assert.equal(navigation[0]!.title['ja'], 'ガイド');
  assert.equal(navigation[0]!.group['ja'], '基本');
  navigation[0]!.title['ja'] = '手動タイトル';
  await write('navigation.json', JSON.stringify(navigation));
  await write('en/guide.md', source + '\nUpdated.');
  await syncManuals(config);
  const updated = JSON.parse(await read('navigation.json')) as typeof navigation;

  assert.equal(updated[0]!.title['ja'], '手動タイトル');
  assert.equal(updated[0]!.group['ja'], 'Start');
  assert.match(await read('ja/guide.md'), /Updated/u);
  assert.match(await read('de/guide.md'), /Anleitung/u);
});

test('Markdown validation protects code blocks and checks only rendered fragment links', () => {
  const source = ['## Guide', '', '>     widget.start()', '', '~~~md', '[Example](#example)', '~~~', '',
    'Use `[sample](#sample)` and [next](#guide).'].join('\n');
  const translated = source.replace('## Guide', '## ガイド').replace('[next](#guide)', '[次へ](#ガイド)');

  validateDocumentTranslation(source, translated, 'markdown');
  assert.throws(() => validateDocumentTranslation(source, translated.replace('start()', 'stop()'), 'markdown'), /protected/u);
  assert.throws(() => validateDocumentTranslation(source, translated.replace('#ガイド)', '#missing)'), 'markdown'), /anchor/u);
});
