import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { getErrorCode } from './fs-errors';

export function isSafePathSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/\0]/u.test(value)
  );
}

export function isSafeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.includes('\\') &&
    value
      .split('/')
      .every(segment => segment !== '' && segment !== '.' && segment !== '..')
  );
}

export function isWithin(
  parent: string,
  child: string,
  mode: 'inclusive' | 'descendant' = 'inclusive',
): boolean {
  const relative = path.relative(parent, child);

  return (
    (mode === 'inclusive' || relative !== '') &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export async function assertNoSymlinkPath(
  rootPath: string,
  targetPath: string,
): Promise<void> {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);

  if (!isWithin(root, target)) {
    throw new Error(`Path must stay inside the repository root: ${target}`);
  }
  let current = root;

  for (const segment of path.relative(root, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Symlink paths are not allowed: ${current}`);
      }
    } catch (error) {
      if (getErrorCode(error) === 'ENOENT') {
        return;
      }
      throw error;
    }
  }
}
