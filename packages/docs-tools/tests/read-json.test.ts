import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseJSON } from '@galacean/docs-tools';

void test('parses valid JSON and preserves keys in separate objects', () => {
  assert.deepEqual(parseJSON('{"outer":{"key":1},"other":{"key":2}}'), {
    outer: { key: 1 },
    other: { key: 2 },
  });
});

void test('rejects duplicate keys at any object depth', () => {
  assert.throws(
    () => parseJSON('{"outer":{"key":1,"key":2}}', 'task.json'),
    /Duplicate JSON key in task\.json: key/u,
  );
});

void test('retains JSON.parse syntax validation', () => {
  assert.throws(() => parseJSON('{invalid json'), SyntaxError);
});
