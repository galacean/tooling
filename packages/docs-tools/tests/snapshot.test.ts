import assert from 'node:assert/strict';
import { test } from 'vitest';
import { sourceProject } from '@galacean/docs-tools';

void test('strips snapshot metadata and translation source markers without mutating input', () => {
  const snapshot = {
    id: 1,
    variant: 'project',
    locale: 'zh-CN',
    apiSnapshot: { commit: 'abc' },
    children: [
      {
        id: 2,
        variant: 'declaration',
        comment: {
          summary: [{ kind: 'text', text: 'Example.' }],
          sourceLocale: 'zh-CN',
          blockTags: [
            {
              tag: '@remarks',
              content: [{ kind: 'text', text: 'Detail.' }],
              sourceLocale: 'en',
            },
          ],
        },
      },
    ],
  };
  const before = structuredClone(snapshot);
  const source = sourceProject(snapshot);
  const child = source.children[0];

  assert.ok(child);
  const comment = child.comment;

  assert.ok(comment);
  const tag = comment.blockTags[0];

  assert.ok(tag);

  assert.equal('locale' in source, false);
  assert.equal('apiSnapshot' in source, false);
  assert.equal('sourceLocale' in comment, false);
  assert.equal('sourceLocale' in tag, false);
  assert.deepEqual(snapshot, before);
});

void test('rejects non-object snapshots', () => {
  assert.throws(
    () => sourceProject(null as unknown as Record<string, unknown>),
    /Invalid localized API snapshot/u,
  );
});
