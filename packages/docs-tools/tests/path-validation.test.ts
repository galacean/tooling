import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'vitest';
import { isWithin } from '../src/path-validation';

test('only descendant checks exclude the directory itself', () => {
  const root = path.resolve('docs');
  const rootAlias = path.join(root, 'manual') + path.sep + '..';

  assert.equal(isWithin(root, rootAlias), true);
  assert.equal(isWithin(root, rootAlias, 'descendant'), false);
  for (const mode of ['inclusive', 'descendant'] as const) {
    assert.equal(isWithin(root, path.join(root, 'manual'), mode), true);
    assert.equal(isWithin(root, path.resolve('docs-preview'), mode), false);
    assert.equal(isWithin(root, path.dirname(root), mode), false);
  }
});
