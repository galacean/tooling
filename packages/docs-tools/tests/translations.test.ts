import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildTranslationSource, localizeProject } from '@galacean/docs-tools';

const project = {
  id: 1,
  name: 'fixture',
  kind: 1,
  variant: 'project',
  flags: {},
  children: [
    {
      id: 2,
      name: 'Widget',
      kind: 256,
      variant: 'declaration',
      flags: {},
      comment: {
        summary: [
          { kind: 'text', text: '使用 ' },
          { kind: 'code', text: '`Widget`' },
        ],
        sourceLocale: 'zh-CN',
      },
    },
  ],
};
const packages = [
  {
    key: 'widget-dir',
    name: '@example/real-widget',
    entries: [{ key: 'root', symbols: [{ name: 'Widget', id: 2, kind: 256 }] }],
  },
];

void test('uses the real package name and translates from an explicit Chinese source locale', () => {
  const source = buildTranslationSource(project, packages, {
    sourceLocale: 'zh-CN',
  });
  const [field] = source.fields;

  assert.ok(field);
  const localized = localizeProject(
    project,
    source,
    {
      sourceHash: source.sourceHash,
      translations: { [field.key]: 'Use {{0}}.' },
    },
    'en',
  );

  assert.equal(field.key, '@example/real-widget|root|Widget|summary');
  assert.equal(field.sourceLocale, 'zh-CN');
  const child = localized.children[0];

  assert.ok(child);
  assert.deepEqual(child.comment.summary, [
    { kind: 'text', text: 'Use ' },
    { kind: 'code', text: '`Widget`' },
    { kind: 'text', text: '.' },
  ]);
  assert.equal(child.comment.sourceLocale, 'en');
});
