import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJSON } from '../api/read-json';
import { assertNoSymlinkPath, isWithin } from '../path-validation';
import { resolveDocsBuildConfig } from './resolve-paths';
import { validateDocsProjectConfig } from './project-validation';
import { isRecord } from './validation';
import type { ResolvedDocsBuildConfig } from './types';

export async function loadDocsProjectConfig(
  configPath: string,
  repositoryRoot: string,
): Promise<ResolvedDocsBuildConfig> {
  const root = await realpath(repositoryRoot);
  const filename = path.resolve(root, configPath);

  if (!isWithin(root, filename) || filename === root) {
    throw new Error('Config path must stay inside the repository root');
  }
  await assertNoSymlinkPath(root, filename);
  const extension = path.extname(filename);
  let loaded: unknown;

  if (extension === '.json') {
    loaded = await readJSON(filename);
  } else if (['.ts', '.mts', '.cts'].includes(extension)) {
    const { tsImport } = await import('tsx/esm/api');

    loaded = await tsImport(pathToFileURL(filename).href, import.meta.url);
  } else {
    loaded = await import(pathToFileURL(filename).href);
  }
  let config: unknown =
    isRecord(loaded) && 'default' in loaded ? loaded['default'] : loaded;

  while (
    isRecord(config) &&
    Object.keys(config).length === 1 &&
    'default' in config
  ) {
    config = config['default'];
  }

  return resolveDocsBuildConfig(validateDocsProjectConfig(config, filename), root, filename);
}
