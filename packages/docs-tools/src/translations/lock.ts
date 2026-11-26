import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { assertNoSymlinkPath } from '../path-validation';

export async function withTranslationLock<T>(config: Pick<ResolvedDocsBuildConfig, 'repositoryRoot' | 'translationDirectory'>, kind: string, operation: () => Promise<T>): Promise<T> {
  const parent = path.join(config.translationDirectory ?? path.join(config.repositoryRoot, 'tmp/docs-tools'), '.locks');
  const lock = path.join(parent, kind);

  await assertNoSymlinkPath(config.repositoryRoot, lock);
  await mkdir(parent, { recursive: true });
  try {
    await mkdir(lock);
  } catch (error) {
    throw new Error(`Cannot acquire ${kind} translation lock; another writer may be running: ${lock}`, { cause: error });
  }
  try {
    return await operation();
  } finally {
    await rm(lock, { recursive: true });
  }
}
