import { createHash } from 'node:crypto';
import path from 'node:path';
import { isRecord } from '../config/validation';
import { assertNoSymlinkPath } from '../path-validation';
import { readOptionalJSON } from '../read-json';

export const generatedHashesFilename = '.generated-hashes.json';

export function manualContentHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Hashes of generated values that may become inputs during the next in-place sync. */
export async function readGeneratedHashes(root: string, directory: string): Promise<Map<string, string>> {
  const filename = path.join(directory, generatedHashesFilename);

  await assertNoSymlinkPath(root, filename);
  const value = await readOptionalJSON(filename);
  const hashes = new Map<string, string>();

  if (value !== undefined) {
    if (!isRecord(value)) {
      throw new Error(`Invalid manual generation state: ${filename}`);
    }
    for (const [key, hash] of Object.entries(value)) {
      if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/u.test(hash)) {
        throw new Error(`Invalid manual generation state: ${filename}`);
      }
      hashes.set(key, hash);
    }
  }

  return hashes;
}
