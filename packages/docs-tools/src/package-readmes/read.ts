import { readDocumentTranslation } from '../translations/document-archive';
import { readFile } from 'node:fs/promises';
import { readOptionalText } from '../read-optional-text';
import { assertNoSymlinkPath } from '../path-validation';
import type { ResolvedDocsBuildConfig } from '../config/types';

export interface PackageReadmeContent {
  text: string;
  sourceLocale: string;
}

export function hasPackageReadme(
  config: ResolvedDocsBuildConfig,
  packageKey: string,
): boolean {
  return (
    config.apiPackages?.some(
      packageConfig =>
        packageConfig.key === packageKey && packageConfig.readme !== undefined,
    ) ?? false
  );
}

export async function readPackageReadme(
  config: ResolvedDocsBuildConfig,
  packageKey: string,
  locale: string,
): Promise<PackageReadmeContent> {
  const pkg = config.apiPackages?.find(
    packageConfig => packageConfig.key === packageKey,
  );
  const packageReadme = pkg?.readme;

  if (packageReadme === undefined) {
    throw new Error(`Missing source README mapping for package: ${packageKey}`);
  }
  const packagePaths = packageReadme.files;
  const packageSourceLocale = packageReadme.sourceLocale ?? config.sourceLocale;
  const sourcePath = packagePaths[packageSourceLocale];

  if (sourcePath === undefined) {
    throw new Error(`Missing source README mapping for package: ${packageKey}`);
  }
  if (!config.locales.includes(locale)) {
    throw new Error(`Unconfigured README locale: ${locale}`);
  }
  const localizedPath = packagePaths[locale];

  if (locale !== packageSourceLocale && localizedPath !== undefined) {
    const text = await readOptionalText(config.repositoryRoot, localizedPath);

    if (text !== undefined) {
      if (text.trim() === '') {
        throw new Error(`Empty package README: ${packageKey}/${locale}`);
      }

      return { text, sourceLocale: locale };
    }
  }
  await assertNoSymlinkPath(config.repositoryRoot, sourcePath);
  const sourceText = await readFile(sourcePath, 'utf8');

  if (sourceText.trim() === '') {
    throw new Error(`Empty package README: ${packageKey}/${packageSourceLocale}`);
  }
  if (locale !== packageSourceLocale) {
    const archived = await readDocumentTranslation(config, { kind: 'package-readmes', owner: packageKey, key: 'readme',
      sourceLocale: packageSourceLocale, format: 'markdown', content: sourceText, title: pkg?.name ?? packageKey, group: '' }, locale);

    if (archived.content !== undefined) {
      return { text: archived.content, sourceLocale: locale };
    }
  }

  return { text: sourceText, sourceLocale: packageSourceLocale };
}
