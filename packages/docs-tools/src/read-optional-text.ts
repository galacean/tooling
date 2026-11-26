import { readFile } from 'node:fs/promises';
import { getErrorCode } from './fs-errors';
import { assertNoSymlinkPath } from './path-validation';

export async function readOptionalText(repositoryRoot: string, filename: string): Promise<string | undefined> {
  await assertNoSymlinkPath(repositoryRoot, filename);
  try {
    return await readFile(filename, 'utf8');
  } catch (error) {
    if (getErrorCode(error) !== 'ENOENT') {
      throw error;
    }

    return undefined;
  }
}
