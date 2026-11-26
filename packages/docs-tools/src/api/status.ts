import path from 'node:path';
import { parseAPIManifest } from '@galacean/docs-site';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { isSafeRelativePath } from '../path-validation';
import { loadTranslationInput } from './extract';
import { readOptionalJSON } from './read-json';
import { readAPITranslationArchive } from './translation-archive';
import { validateTranslation } from './translations';
import { inspectAPIVersionState } from './versioned-state';
import type { APIVersionState } from './versioned-state';
import { parseAPIVersionManifest } from './versions';

export interface APIStatusResult {
  version: string;
  generation: APIVersionState;
  translations: {
    packageKey: string;
    locale: string;
    status: 'complete' | 'missing' | 'invalid';
    reason?: string;
  }[];
}

export async function getAPIStatus(
  config: ResolvedDocsBuildConfig,
  selectedVersion?: string,
): Promise<APIStatusResult[]> {
  if (config.apiVersions === undefined) {
    throw new Error('api status requires api.repository and api.versions');
  }
  const versionManifest = parseAPIVersionManifest(config.apiVersions);
  const versions = selectedVersion === undefined
    ? versionManifest.versions
    : [selectedVersion];

  if (versions.some(version => !versionManifest.versions.includes(version))) {
    throw new Error(`API version is not configured: ${selectedVersion}`);
  }
  const manifestValue = await readOptionalJSON(
    path.join(config.apiDirectory, 'manifest.json'),
  );
  const manifest = manifestValue === undefined
    ? undefined
    : parseAPIManifest(manifestValue);
  const dataRoot = path.dirname(config.apiDirectory);
  const results: APIStatusResult[] = [];

  for (const version of versions) {
    const generation = await inspectAPIVersionState(config, version);
    const translations: APIStatusResult['translations'] = [];

    for (const packageConfig of config.apiPackages ?? []) {
      const packageVersion = manifest?.packages
        .find(pkg => pkg.key === packageConfig.key)
        ?.versions.find(item => item.version === version);

      for (const locale of config.locales) {
        if (locale === config.sourceLocale) {
          continue;
        }
        const relativePath = packageVersion?.json[locale];

        if (relativePath === undefined) {
          translations.push({
            packageKey: packageConfig.key,
            locale,
            status: 'missing',
          });
          continue;
        }
        if (!isSafeRelativePath(relativePath)) {
          translations.push({
            packageKey: packageConfig.key,
            locale,
            status: 'invalid',
            reason: `Unsafe API manifest path: ${relativePath}`,
          });
          continue;
        }
        try {
          const targetPath = path.resolve(dataRoot, relativePath);
          const input = await loadTranslationInput(targetPath, config);
          const archive = await readAPITranslationArchive(
            config,
            packageConfig.key,
            version,
            locale,
          );

          if (archive === undefined) {
            translations.push({
              packageKey: packageConfig.key,
              locale,
              status: 'missing',
            });
            continue;
          }
          validateTranslation(
            {
              version: archive.version,
              sourceHash: archive.sourceHash,
              translations: archive.translations,
            },
            input.translationSource,
            locale,
            version,
          );
          translations.push({
            packageKey: packageConfig.key,
            locale,
            status: 'complete',
          });
        } catch (error) {
          translations.push({
            packageKey: packageConfig.key,
            locale,
            status: 'invalid',
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    results.push({ version, generation, translations });
  }

  return results;
}
