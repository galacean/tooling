import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseAPIManifest } from '@galacean/docs-site';
import { assertNoSymlinkPath } from '../config/site-config';
import type { DocsSiteConfig } from '../config/site-config';
import { readJSON } from '../api/read-json';
import { hasPackageReadme, readPackageReadme } from './read';

export async function buildPackageReadmes(
  config: DocsSiteConfig,
): Promise<Record<string, number>> {
  const manifestPath = path.join(config.apiDirectory, 'manifest.json');

  await assertNoSymlinkPath(config.repositoryRoot, manifestPath);
  const manifest = parseAPIManifest(await readJSON(manifestPath));
  const dataRoot = path.dirname(config.apiDirectory);
  const outputDirectory = path.join(dataRoot, 'package-readmes');
  const counts: Record<string, number> = {};

  await assertNoSymlinkPath(config.repositoryRoot, outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  for (const pkg of manifest.packages) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(pkg.key)) {
      throw new Error(`Unsafe package key in API manifest: ${pkg.key}`);
    }
    if (!hasPackageReadme(config, pkg.key)) {
      continue;
    }
    const packageOutput = path.join(outputDirectory, pkg.key);

    await mkdir(packageOutput, { recursive: true });
    for (const locale of config.locales) {
      const readme = await readPackageReadme(config, pkg.key, locale);
      const outputPath = path.join(packageOutput, `${locale}.json`);

      await writeFile(outputPath, `${JSON.stringify(readme)}\n`);
      counts[locale] = (counts[locale] ?? 0) + 1;
    }
  }

  return counts;
}
