import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseAPIManifest, isRecord } from '@galacean/docs-site';
import type { ResolvedDocsBuildConfig } from '../config/types';
import { assertNoSymlinkPath } from '../path-validation';
import { writeFileAtomically } from '../atomic-write';
import { readOptionalJSON } from './read-json';
import { readAPISnapshot } from './snapshot-reference';
import { localizedSnapshotHash, sourceProject } from './snapshot';
import { readAPITranslationArchive } from './translation-archive';
import { buildTranslationSource, collectCommentFields, localizeProjectWithFallback, validateTranslation } from './translations';
import type { DocumentationPackage } from './translations';
import { inspectAPIVersionState } from './versioned-state';

async function storeSnapshot(config: ResolvedDocsBuildConfig, model: Record<string, unknown>): Promise<string> {
  const text = `${JSON.stringify(model)}\n`;
  const hash = createHash('sha256').update(text).digest('hex');
  const reference = `api/snapshots/${hash}.api.json`;
  const filename = path.join(path.dirname(config.apiDirectory), reference);

  await assertNoSymlinkPath(config.repositoryRoot, filename);
  await mkdir(path.dirname(filename), { recursive: true });
  try {
    await writeFile(filename, text, { flag: 'wx' });
  } catch (error) {
    if (!isRecord(error) || error['code'] !== 'EEXIST' || await readFile(filename, 'utf8') !== text) {
      throw error;
    }
  }

  return reference;
}

/** Adds language views of verified existing models without rebuilding a source tag. */
export async function synchronizeAPILocales(config: ResolvedDocsBuildConfig, selectedVersion?: string): Promise<{ versions: number; warnings: string[] }> {
  const manifestPath = path.join(config.apiDirectory, 'manifest.json');

  await assertNoSymlinkPath(config.repositoryRoot, manifestPath);
  const raw = await readOptionalJSON(manifestPath);

  if (raw === undefined) {
    return { versions: 0, warnings: [] };
  }
  const manifest = parseAPIManifest(raw);
  const versions = [...new Set(manifest.packages.flatMap(pkg => pkg.versions.map(item => item.version)))]
    .filter(version => config.apiVersions === undefined || config.apiVersions.versions.includes(version))
    .filter(version => selectedVersion === undefined || selectedVersion === version);

  if (selectedVersion !== undefined && !versions.includes(selectedVersion)) {
    throw new Error(`API version is not available: ${selectedVersion}`);
  }
  const pending: string[] = [];

  // Validate every selected model before writing any derived files.
  for (const version of versions) {
    const state = await inspectAPIVersionState(config, version);

    if (state.status === 'invalid' || state.status === 'missing') {
      throw new Error(`Cannot synchronize API locales for ${version}: ${state.status === 'invalid' ? state.reason : state.status}`);
    }
    if (state.status === 'locales-pending') {
      pending.push(version);
    }
  }
  const warnings: string[] = [];
  const dataRoot = path.dirname(config.apiDirectory);

  for (const version of pending) {
    const first = manifest.packages[0]?.versions.find(item => item.version === version);
    const sourcePath = first?.json[config.sourceLocale];

    if (sourcePath === undefined) {
      throw new Error(`Missing authoritative API source: ${version}/${config.sourceLocale}`);
    }
    const sourceSnapshot = (await readAPISnapshot(path.join(dataRoot, sourcePath), dataRoot, config.repositoryRoot)).value;

    if (!isRecord(sourceSnapshot) || !isRecord(sourceSnapshot['apiSnapshot']) || !Array.isArray(sourceSnapshot['apiSnapshot']['packages'])) {
      throw new Error(`Invalid source model for ${version}`);
    }
    const project = sourceProject(sourceSnapshot);
    const metadata = sourceSnapshot['apiSnapshot'];
    const packages = metadata['packages'] as DocumentationPackage[];
    const source = buildTranslationSource(project, packages, { sourceLocale: config.sourceLocale });

    const records = manifest.packages.map(pkg => ({
      pkg,
      item: pkg.versions.find(item => item.version === version)!,
      metadata: packages.filter(item => item.key === pkg.key),
      translatedLocales: [] as string[],
    }));
    const applied = first!.snapshot !== metadata['snapshot'];
    const localizedModels: Record<string, unknown> = {};

    for (const locale of config.locales) {
      const existing = records.find(({ item }) => item.json[locale] !== undefined);
      let model: Record<string, unknown>;
      let reference: string;

      if (existing !== undefined) {
        const wrapper = existing.item.json[locale]!;
        const loaded = await readAPISnapshot(path.join(dataRoot, wrapper), dataRoot, config.repositoryRoot);

        if (!isRecord(loaded.value)) {
          throw new Error(`Invalid API model for ${version}/${locale}`);
        }
        model = loaded.value;
        reference = `api/snapshots/${path.basename(loaded.resolvedPath)}`;
      } else {
        const translations: Record<string, string> = {};

        for (const pkg of packages) {
          const archive = await readAPITranslationArchive(config, pkg.key, version, locale);

          if (archive === undefined) {
            continue;
          }
          try {
            const packageSource = buildTranslationSource(project, [pkg], { sourceLocale: config.sourceLocale });

            Object.assign(translations, validateTranslation({
              version, sourceHash: archive.sourceHash, translations: archive.translations,
            }, packageSource, locale, version));
          } catch {
            warnings.push(`${pkg.key}@${version}/${locale}: archive needs review; using source fallback`);
          }
        }
        model = { ...localizeProjectWithFallback(project, source, translations, locale), apiSnapshot: metadata };
        reference = await storeSnapshot(config, model);
      }

      if (applied) {
        localizedModels[locale] = model;
      }
      for (const record of records) {
        const { pkg, item } = record;

        if (item.json[locale] === undefined) {
          const wrapper = `api/${pkg.key}/${version}/${locale}.api.json`;
          const filename = path.join(dataRoot, wrapper);

          await assertNoSymlinkPath(config.repositoryRoot, filename);
          await mkdir(path.dirname(filename), { recursive: true });
          await writeFileAtomically(filename, `${JSON.stringify({ $ref: reference })}\n`);
          item.json[locale] = wrapper;
        }
        const fields = collectCommentFields(model, record.metadata, { sourceLocale: config.sourceLocale });

        if (fields.every(field => field.sourceLocale === locale)) {
          record.translatedLocales.push(locale);
        }
      }
    }
    const revision = applied ? localizedSnapshotHash(sourceSnapshot, localizedModels) : first!.snapshot;

    for (const { pkg, item, translatedLocales } of records) {
      item.json = Object.fromEntries(config.locales.map(locale => [locale, item.json[locale]!]));
      item.translatedLocales = translatedLocales;
      item.snapshot = revision;
      if (pkg.current.packageVersion === version) {
        pkg.current = { ...item, version: 'current', packageVersion: version };
      }
    }
  }
  if (pending.length > 0) {
    await writeFileAtomically(manifestPath, `${JSON.stringify(parseAPIManifest(manifest), null, 2)}\n`);
  }

  return { versions: pending.length, warnings };
}
