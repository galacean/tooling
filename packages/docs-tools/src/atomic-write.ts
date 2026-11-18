import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';

export async function writeFileAtomically(
  filename: string,
  contents: string,
): Promise<void> {
  const temporaryPath = `${filename}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryPath, contents, { flag: 'wx' });
    await rename(temporaryPath, filename);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
