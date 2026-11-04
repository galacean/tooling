import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const skillName = 'api-documentation-translation';
const manifestName = '.managed.json';

export interface SyncManagedSkillOptions {
  repositoryRoot: string;
  sourceDirectory: string;
  packageVersion: string;
  check?: boolean;
}

export interface SyncManagedSkillResult {
  changed: boolean;
  targetDirectory: string;
}

interface ManagedManifest {
  schemaVersion: 1;
  packageVersion: string;
  files: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

function hash(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

async function assertDirectoryIfPresent(directoryPath: string): Promise<void> {
  try {
    const info = await lstat(directoryPath);

    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error(
        `Managed Skill path must be a real directory: ${directoryPath}`,
      );
    }
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      throw error;
    }
  }
}

async function writeAtomic(
  filePath: string,
  contents: string | Uint8Array,
): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;

  try {
    await writeFile(temporaryPath, contents, { flag: 'wx' });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function syncManagedSkill({
  repositoryRoot,
  sourceDirectory,
  packageVersion,
  check = false,
}: SyncManagedSkillOptions): Promise<SyncManagedSkillResult> {
  const root = path.resolve(repositoryRoot);
  const parentDirectory = path.join(root, '.agents', 'skills');
  const targetDirectory = path.join(parentDirectory, skillName);
  const sourcePath = path.join(sourceDirectory, 'SKILL.md');
  const source = await readFile(sourcePath);
  const expectedHash = hash(source);
  const expectedManifest: ManagedManifest = {
    schemaVersion: 1,
    packageVersion,
    files: { 'SKILL.md': expectedHash },
  };

  await assertDirectoryIfPresent(path.join(root, '.agents'));
  await assertDirectoryIfPresent(parentDirectory);
  await assertDirectoryIfPresent(targetDirectory);

  let entries: string[] = [];

  try {
    entries = await readdir(targetDirectory);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      throw error;
    }
  }

  const manifestPath = path.join(targetDirectory, manifestName);

  if (entries.includes('tmp')) {
    await assertDirectoryIfPresent(path.join(targetDirectory, 'tmp'));
  }
  const managedEntries = entries.filter(entry => entry !== 'tmp');
  let existingManifest: ManagedManifest | undefined;

  if (managedEntries.length > 0) {
    if (!managedEntries.includes(manifestName)) {
      throw new Error(
        `Refusing to overwrite an unmanaged Skill directory: ${targetDirectory}`,
      );
    }
    const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));

    if (
      !isRecord(parsed) ||
      parsed['schemaVersion'] !== 1 ||
      typeof parsed['packageVersion'] !== 'string' ||
      !isRecord(parsed['files']) ||
      Object.values(parsed['files']).some(value => typeof value !== 'string')
    ) {
      throw new Error(`Invalid managed Skill manifest: ${manifestPath}`);
    }
    existingManifest = parsed as unknown as ManagedManifest;
    const managedFiles = Object.keys(existingManifest.files);
    const actualFiles = managedEntries.filter(entry => entry !== manifestName);

    if (
      managedFiles.length !== actualFiles.length ||
      managedFiles.some(file => !actualFiles.includes(file))
    ) {
      throw new Error(
        `Managed Skill directory contains unmanaged files: ${targetDirectory}`,
      );
    }
    for (const [file, expected] of Object.entries(existingManifest.files)) {
      const filePath = path.join(targetDirectory, file);
      const info = await lstat(filePath);

      if (
        info.isSymbolicLink() ||
        !info.isFile() ||
        hash(await readFile(filePath)) !== expected
      ) {
        throw new Error(
          `Managed Skill file was modified; refusing to overwrite: ${filePath}`,
        );
      }
    }
  }

  const alreadyCurrent =
    existingManifest?.packageVersion === packageVersion &&
    existingManifest.files['SKILL.md'] === expectedHash;

  if (check) {
    if (!alreadyCurrent) {
      throw new Error(
        `Managed Skill is missing or out of date: ${targetDirectory}`,
      );
    }

    return { changed: false, targetDirectory };
  }
  if (alreadyCurrent) {
    return { changed: false, targetDirectory };
  }

  await mkdir(targetDirectory, { recursive: true });
  await writeAtomic(path.join(targetDirectory, 'SKILL.md'), source);
  await writeAtomic(
    manifestPath,
    `${JSON.stringify(expectedManifest, null, 2)}\n`,
  );

  return { changed: true, targetDirectory };
}
