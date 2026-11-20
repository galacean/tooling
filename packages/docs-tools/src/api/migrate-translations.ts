import path from 'node:path';
import { parseAPIManifest } from '@galacean/docs-site';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { loadTranslationInput } from './extract';
import { readJSON } from './read-json';
import { readAPITranslationArchive, writeAPITranslationArchive } from './translation-archive';
import {
  collectCommentFields,
  translateParts,
  validateTranslation,
} from './translations';
import type { DocumentationPackage } from './translations';

export interface APITranslationMigrationResult {
  migrated: number;
  skipped: { packageKey: string; version: string; locale: string; reason: string }[];
}

export async function migrateAPITranslations(
  config: ResolvedDocsBuildConfig,
  selectedVersion?: string,
): Promise<APITranslationMigrationResult> {
  if (config.apiVersions === undefined) {
    throw new Error('API translation migration requires api.repository and api.versions');
  }
  const manifest = parseAPIManifest(
    await readJSON(path.join(config.apiDirectory, 'manifest.json')),
  );
  const configuredVersions = config.apiVersions.versions;
  const versions = selectedVersion === undefined
    ? configuredVersions
    : [selectedVersion];

  if (versions.some(version => !configuredVersions.includes(version))) {
    throw new Error(`API version is not configured: ${selectedVersion}`);
  }
  const skipped: APITranslationMigrationResult['skipped'] = [];
  let migrated = 0;

  for (const packageConfig of config.apiPackages ?? []) {
    const manifestPackage = manifest.packages.find(
      item => item.key === packageConfig.key,
    );

    for (const version of versions) {
      const packageVersion = manifestPackage?.versions.find(
        item => item.version === version,
      );

      for (const locale of config.locales) {
        if (locale === config.sourceLocale) {
          continue;
        }
        if (packageVersion?.json[locale] === undefined) {
          skipped.push({
            packageKey: packageConfig.key,
            version,
            locale,
            reason: 'snapshot path is missing',
          });
          continue;
        }
        let existing;

        try {
          existing = await readAPITranslationArchive(
            config,
            packageConfig.key,
            version,
            locale,
          );
        } catch (error) {
          skipped.push({
            packageKey: packageConfig.key,
            version,
            locale,
            reason: `existing translation archive is invalid: ${error instanceof Error ? error.message : String(error)}`,
          });
          continue;
        }

        if (existing !== undefined) {
          skipped.push({
            packageKey: packageConfig.key,
            version,
            locale,
            reason: 'translation archive already exists',
          });
          continue;
        }
        try {
          const targetPath = path.resolve(
            path.dirname(config.apiDirectory),
            packageVersion.json[locale],
          );
          const input = await loadTranslationInput(targetPath, config);
          const packages = input.apiSnapshot['packages'];

          if (!Array.isArray(packages)) {
            throw new Error('API snapshot package metadata is invalid');
          }
          const packageMetadata = (packages as DocumentationPackage[]).filter(
            item => item.key === packageConfig.key,
          );
          const localizedFields = collectCommentFields(
            input.targetProject,
            packageMetadata,
            { sourceLocale: config.sourceLocale },
          );
          const localizedByKey = new Map(
            localizedFields.map(field => [field.key, field]),
          );
          const translations: Record<string, string> = {};

          for (const sourceField of input.translationSource.fields) {
            if (sourceField.sourceLocale === locale) {
              continue;
            }
            const localizedField = localizedByKey.get(sourceField.key);

            if (localizedField?.sourceLocale !== locale) {
              throw new Error(`Incomplete translated field: ${sourceField.key}`);
            }
            translateParts(sourceField, localizedField.sourceText);
            translations[sourceField.key] = localizedField.sourceText;
          }
          validateTranslation(
            {
              version,
              sourceHash: input.sourceHash,
              translations,
            },
            input.translationSource,
            locale,
            version,
          );
          await writeAPITranslationArchive(
            config,
            {
              locale,
              version,
              sourceHash: input.sourceHash,
              translations,
            },
            packageConfig.key,
          );
          migrated += 1;
        } catch (error) {
          skipped.push({
            packageKey: packageConfig.key,
            version,
            locale,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  return { migrated, skipped };
}
