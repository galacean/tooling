import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isRecord, parseAPIManifest } from '@galacean/docs-site';
import type { APIManifest } from '@galacean/docs-site';
import { assertNoSymlinkPath } from '../config/site-config';
import type { DocsSiteConfig } from '../config/site-config';
import { readJSON, parseJSON } from './read-json';
import { resolveAPISnapshotReference } from './snapshot-reference';

type SnapshotCleanupConfig = Pick<
  DocsSiteConfig,
  'repositoryRoot' | 'apiDirectory'
>;

export interface APISnapshotFile {
  path: string;
  bytes: number;
}

export interface APISnapshotCleanupResult {
  referenced: number;
  orphaned: APISnapshotFile[];
  skipped: { path: string; reason: string }[];
  deleted: string[];
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function errorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

function relativeDataPath(dataRoot: string, filename: string): string {
  return path.relative(dataRoot, filename).split(path.sep).join('/');
}

async function collectReferencedSnapshots(
  manifest: APIManifest,
  dataRoot: string,
  snapshotsDirectory: string,
  repositoryRoot: string,
): Promise<Set<string>> {
  const referencedPaths = new Set<string>();

  for (const pkg of manifest.packages) {
    for (const version of pkg.versions) {
      for (const relativePath of Object.values(version.json)) {
        const indexPath = path.resolve(dataRoot, relativePath);

        if (!isWithin(dataRoot, indexPath)) {
          throw new Error(`API manifest path leaves the data directory: ${relativePath}`);
        }
        await assertNoSymlinkPath(repositoryRoot, indexPath);
        const index = await readJSON(indexPath);
        const referencePath = resolveAPISnapshotReference(dataRoot, index);

        if (referencePath === undefined) {
          if (isRecord(index) && '$ref' in index) {
            throw new Error(`Invalid API snapshot reference in ${indexPath}`);
          }
          continue;
        }
        await assertNoSymlinkPath(repositoryRoot, referencePath);
        const referenceStat = await lstat(referencePath);

        if (referenceStat.isSymbolicLink() || !referenceStat.isFile()) {
          throw new Error(`API snapshot reference is not a regular file: ${referencePath}`);
        }
        if (path.dirname(referencePath) === snapshotsDirectory) {
          referencedPaths.add(referencePath);
        }
      }
    }
  }

  return referencedPaths;
}

async function findOrphanedSnapshots(
  snapshotsDirectory: string,
  dataRoot: string,
  repositoryRoot: string,
  referencedPaths: Set<string>,
): Promise<{
  orphaned: APISnapshotFile[];
  skipped: APISnapshotCleanupResult['skipped'];
}> {
  let entries;

  try {
    entries = await readdir(snapshotsDirectory, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { orphaned: [], skipped: [] };
    }
    throw error;
  }

  const orphaned: APISnapshotFile[] = [];
  const skipped: APISnapshotCleanupResult['skipped'] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-f\d]{64}\.api\.json$/u.test(entry.name)) {
      continue;
    }
    const filename = path.join(snapshotsDirectory, entry.name);

    await assertNoSymlinkPath(repositoryRoot, filename);
    const stat = await lstat(filename);

    if (stat.isSymbolicLink() || !stat.isFile()) {
      skipped.push({ path: relativeDataPath(dataRoot, filename), reason: 'not a regular file' });
      continue;
    }
    if (referencedPaths.has(filename)) {
      continue;
    }
    const contents = await readFile(filename);
    const actualHash = createHash('sha256').update(contents).digest('hex');

    if (entry.name !== `${actualHash}.api.json`) {
      skipped.push({
        path: relativeDataPath(dataRoot, filename),
        reason: 'filename does not match content hash',
      });
      continue;
    }
    orphaned.push({ path: relativeDataPath(dataRoot, filename), bytes: stat.size });
  }

  return { orphaned, skipped };
}

async function deleteOrphanedSnapshots(
  orphaned: APISnapshotFile[],
  manifestPath: string,
  manifestText: string,
  dataRoot: string,
  repositoryRoot: string,
): Promise<string[]> {
  if (orphaned.length === 0) {
    return [];
  }
  await assertNoSymlinkPath(repositoryRoot, manifestPath);
  if ((await readFile(manifestPath, 'utf8')) !== manifestText) {
    throw new Error('API manifest changed during snapshot cleanup; run the command again');
  }

  const deleted: string[] = [];

  for (const file of orphaned) {
    const filename = path.resolve(dataRoot, file.path);

    await assertNoSymlinkPath(repositoryRoot, filename);
    const contents = await readFile(filename);

    if (
      createHash('sha256').update(contents).digest('hex') !==
      path.basename(filename, '.api.json')
    ) {
      throw new Error(`API snapshot changed during cleanup: ${file.path}`);
    }
    await unlink(filename);
    deleted.push(file.path);
  }

  return deleted;
}

export async function cleanAPISnapshots(
  config: SnapshotCleanupConfig,
): Promise<APISnapshotCleanupResult> {
  const repositoryRoot = path.resolve(config.repositoryRoot);
  const apiDirectory = path.resolve(config.apiDirectory);
  const dataRoot = path.dirname(apiDirectory);
  const manifestPath = path.join(apiDirectory, 'manifest.json');
  const snapshotsDirectory = path.join(apiDirectory, 'snapshots');

  await assertNoSymlinkPath(repositoryRoot, apiDirectory);
  await assertNoSymlinkPath(repositoryRoot, manifestPath);
  await assertNoSymlinkPath(repositoryRoot, snapshotsDirectory);
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = parseAPIManifest(parseJSON(manifestText, manifestPath));
  const referencedPaths = await collectReferencedSnapshots(
    manifest,
    dataRoot,
    snapshotsDirectory,
    repositoryRoot,
  );
  const { orphaned, skipped } = await findOrphanedSnapshots(
    snapshotsDirectory,
    dataRoot,
    repositoryRoot,
    referencedPaths,
  );
  const deleted = await deleteOrphanedSnapshots(
    orphaned,
    manifestPath,
    manifestText,
    dataRoot,
    repositoryRoot,
  );

  return { referenced: referencedPaths.size, orphaned, skipped, deleted };
}
