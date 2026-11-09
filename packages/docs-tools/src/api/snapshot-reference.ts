import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isRecord } from '@galacean/docs-site';
import { assertNoSymlinkPath } from '../config/site-config';
import { parseJSON } from './read-json';

export interface LoadedAPISnapshot {
  value: unknown;
  text: string;
  resolvedPath: string;
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export function resolveAPISnapshotReference(
  dataRoot: string,
  value: unknown,
): string | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    typeof value['$ref'] !== 'string'
  ) {
    return undefined;
  }
  const relativePath = value['$ref'];

  if (
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.includes('\\') ||
    relativePath
      .split('/')
      .some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`Unsafe API snapshot reference: ${relativePath}`);
  }
  const filename = path.resolve(dataRoot, relativePath);

  if (!isWithin(dataRoot, filename)) {
    throw new Error(`API snapshot reference leaves the data directory: ${relativePath}`);
  }

  return filename;
}

export async function readAPISnapshot(
  filename: string,
  dataRoot: string,
  repositoryRoot: string,
): Promise<LoadedAPISnapshot> {
  await assertNoSymlinkPath(repositoryRoot, filename);
  const wrapperText = await readFile(filename, 'utf8');
  const wrapper = parseJSON(wrapperText, filename);
  const referencePath = resolveAPISnapshotReference(dataRoot, wrapper);

  if (referencePath === undefined) {
    return { value: wrapper, text: wrapperText, resolvedPath: filename };
  }
  await assertNoSymlinkPath(repositoryRoot, referencePath);
  const text = await readFile(referencePath, 'utf8');

  return {
    value: parseJSON(text, referencePath),
    text,
    resolvedPath: referencePath,
  };
}
