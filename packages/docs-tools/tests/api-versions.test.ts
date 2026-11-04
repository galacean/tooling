import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  compareVersions,
  parseVersion,
  versionGroup,
} from '@galacean/docs-tools';

void test('parses stable and prerelease versions', () => {
  assert.deepEqual(parseVersion('1.2.3-beta.2'), {
    major: 1,
    minor: 2,
    patch: 3,
    prerelease: ['beta', '2'],
  });
  assert.equal(versionGroup('1.2.3'), '1.2');
});

void test('compares SemVer prerelease identifiers and ignores build metadata', () => {
  assert.equal(compareVersions('1.2.3-beta.2', '1.2.3-beta.10'), -1);
  assert.equal(compareVersions('1.2.3+build.1', '1.2.3+build.2'), 0);
  assert.equal(compareVersions('1.2.3', '1.2.3-rc.1'), 1);
});

void test('rejects invalid SemVer values', () => {
  assert.throws(() => parseVersion('01.2.3'), /Invalid API package version/u);
  assert.throws(
    () => compareVersions('1.2.3', 'not-a-version'),
    /Invalid API package version/u,
  );
});
