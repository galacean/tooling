import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { createCommandLogger } from '../src/bin/command-logger';

void test('colors command and level tags when color is enabled', () => {
  vi.stubEnv('NO_COLOR', '');
  vi.stubEnv('FORCE_COLOR', '1');
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});

  try {
    createCommandLogger('api generate').success('Generated 2 packages');

    assert.equal(
      info.mock.calls[0]?.[0],
      '\u001b[2m[docs-tools]\u001b[0m \u001b[1;36m[api generate]\u001b[0m \u001b[32m[SUCCESS]\u001b[0m Generated 2 packages',
    );
  } finally {
    info.mockRestore();
    vi.unstubAllEnvs();
  }
});

void test('NO_COLOR disables ANSI even when FORCE_COLOR is set', () => {
  vi.stubEnv('NO_COLOR', '1');
  vi.stubEnv('FORCE_COLOR', '1');
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});

  try {
    createCommandLogger('search build').info('Building indexes');

    assert.equal(
      info.mock.calls[0]?.[0],
      '[docs-tools][search build][INFO] Building indexes',
    );
  } finally {
    info.mockRestore();
    vi.unstubAllEnvs();
  }
});
