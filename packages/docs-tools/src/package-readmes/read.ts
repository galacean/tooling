import { readFile } from 'node:fs/promises';
import { assertNoSymlinkPath } from '../config/site-config';
import type { DocsSiteConfig } from '../config/site-config';

export interface PackageReadmeContent {
  text: string;
  sourceLocale: string;
}

export async function readPackageReadme(
  config: DocsSiteConfig,
  packageKey: string,
  locale: string,
): Promise<PackageReadmeContent> {
  const packagePaths = config.packageReadmes?.[packageKey];

  if (packagePaths === undefined) {
    throw new Error(`Missing source README mapping for package: ${packageKey}`);
  }
  const packageSourceLocale =
    config.packageReadmeSourceLocales?.[packageKey] ?? config.sourceLocale;
  const sourcePath = packagePaths[packageSourceLocale];

  if (sourcePath === undefined) {
    throw new Error(`Missing source README mapping for package: ${packageKey}`);
  }
  if (!config.locales.includes(locale)) {
    throw new Error(`Unconfigured README locale: ${locale}`);
  }
  const localizedPath = packagePaths[locale] ?? sourcePath;

  await assertNoSymlinkPath(config.repositoryRoot, localizedPath);
  let text: string;
  let sourceLocale =
    packagePaths[locale] === undefined ? packageSourceLocale : locale;

  try {
    text = await readFile(localizedPath, 'utf8');
  } catch (error) {
    if (
      error === null ||
      typeof error !== 'object' ||
      !('code' in error) ||
      error.code !== 'ENOENT' ||
      locale === packageSourceLocale
    ) {
      throw error;
    }
    await assertNoSymlinkPath(config.repositoryRoot, sourcePath);
    text = await readFile(sourcePath, 'utf8');
    sourceLocale = packageSourceLocale;
  }
  if (text.trim() === '') {
    throw new Error(`Empty package README: ${packageKey}/${sourceLocale}`);
  }

  return { text, sourceLocale };
}
