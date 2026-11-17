import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  compareVersions,
  parseAPIVersionManifest,
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

void test('validates a non-empty, unique list of safe Git tag versions', () => {
  assert.deepEqual(
    parseAPIVersionManifest({
      repository: 'https://github.com/example/project.git',
      versions: ['1.2.3-beta.1', '1.2.4'],
    }),
    {
      repository: 'https://github.com/example/project.git',
      versions: ['1.2.3-beta.1', '1.2.4'],
    },
  );
  assert.throws(
    () =>
      parseAPIVersionManifest({
        repository: 'https://github.com/example/project.git',
        versions: [],
      }),
    /non-empty array/u,
  );
  assert.throws(
    () =>
      parseAPIVersionManifest({
        repository: 'https://github.com/example/project.git',
        versions: ['1.2.3', '1.2.3'],
      }),
    /Duplicate API version/u,
  );
  assert.throws(
    () =>
      parseAPIVersionManifest({
        repository: 'file:///tmp/project',
        versions: ['1.2.3'],
      }),
    /safe HTTPS URL/u,
  );
  assert.throws(
    () =>
      parseAPIVersionManifest({
        repository: 'https://github.com/example/project.git',
        versions: ['1.2.3/../../main'],
      }),
    /Unsafe API Git tag name/u,
  );
});

void test('requires an explicit SemVer version instead of a current sentinel', () => {
  assert.throws(
    () =>
      parseAPIVersionManifest({
        repository: 'https://github.com/example/project.git',
        versions: ['current'],
      }),
    /Invalid API package version: current/u,
  );
});
