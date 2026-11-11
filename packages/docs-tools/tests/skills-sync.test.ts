import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import type { TestContext } from 'vitest';
import { syncManagedSkill } from '@galacean/docs-tools';

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docs-tools-skill-'));
  const source = path.join(root, 'source');
  const repositoryRoot = path.join(root, 'consumer');

  await mkdir(source);
  await mkdir(repositoryRoot);
  await writeFile(path.join(source, 'SKILL.md'), '# Managed Skill\n');
  t.onTestFinished(() => rm(root, { recursive: true, force: true }));

  return { root, source, repositoryRoot };
}

void test('creates a managed copy and leaves an up-to-date copy unchanged', async t => {
  const { source, repositoryRoot } = await fixture(t);
  const first = await syncManagedSkill({
    repositoryRoot,
    sourceDirectory: source,
    packageVersion: '0.0.1',
  });
  const second = await syncManagedSkill({
    repositoryRoot,
    sourceDirectory: source,
    packageVersion: '0.0.1',
  });

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(
    await readFile(path.join(first.targetDirectory, 'SKILL.md'), 'utf8'),
    '# Managed Skill\n',
  );
  await syncManagedSkill({
    repositoryRoot,
    sourceDirectory: source,
    packageVersion: '0.0.1',
    check: true,
  });
});

void test('refuses to overwrite modified or unmanaged files', async t => {
  const { source, repositoryRoot } = await fixture(t);
  const result = await syncManagedSkill({
    repositoryRoot,
    sourceDirectory: source,
    packageVersion: '0.0.1',
  });

  await writeFile(
    path.join(result.targetDirectory, 'SKILL.md'),
    '# User edit\n',
  );
  await assert.rejects(
    syncManagedSkill({
      repositoryRoot,
      sourceDirectory: source,
      packageVersion: '0.0.2',
    }),
    /was modified/u,
  );
});

void test('refuses a pre-existing directory without a managed manifest', async t => {
  const { source, repositoryRoot } = await fixture(t);
  const targetDirectory = path.join(
    repositoryRoot,
    '.agents/skills/api-documentation-translation',
  );

  await mkdir(targetDirectory, { recursive: true });
  await writeFile(path.join(targetDirectory, 'SKILL.md'), 'unmanaged\n');
  await assert.rejects(
    syncManagedSkill({
      repositoryRoot,
      sourceDirectory: source,
      packageVersion: '0.0.1',
    }),
    /unmanaged Skill directory/u,
  );
});

void test('preserves a legacy tmp directory while synchronizing only the managed Skill source', async t => {
  const { source, repositoryRoot } = await fixture(t);
  const legacyRun = path.join(
    repositoryRoot,
    '.agents/skills/api-documentation-translation/tmp/run-old',
  );
  const taskPath = path.join(legacyRun, '001.task.json');
  const contents = JSON.stringify({ version: '0.0.1-beta.10', pending: true });

  await mkdir(legacyRun, { recursive: true });
  await writeFile(taskPath, contents);
  const first = await syncManagedSkill({
    repositoryRoot,
    sourceDirectory: source,
    packageVersion: '0.0.1',
  });
  const second = await syncManagedSkill({
    repositoryRoot,
    sourceDirectory: source,
    packageVersion: '0.0.1',
  });

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(await readFile(taskPath, 'utf8'), contents);
  await syncManagedSkill({
    repositoryRoot,
    sourceDirectory: source,
    packageVersion: '0.0.1',
    check: true,
  });
});

void test('synchronizes additional named skills with independent managed manifests', async t => {
  const { source, repositoryRoot } = await fixture(t);
  const result = await syncManagedSkill({
    repositoryRoot,
    sourceDirectory: source,
    packageVersion: '0.0.1',
    skillName: 'manual-documentation-translation',
  });

  assert.equal(
    result.targetDirectory,
    path.join(
      repositoryRoot,
      '.agents/skills/manual-documentation-translation',
    ),
  );
  await syncManagedSkill({
    repositoryRoot,
    sourceDirectory: source,
    packageVersion: '0.0.1',
    skillName: 'manual-documentation-translation',
    check: true,
  });
});
