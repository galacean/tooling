#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import {
  applyTranslationPairs,
  cleanAPISnapshots,
  extractTranslationTasks,
  generateAPIDocumentation,
} from '../api';
import { loadSiteConfig } from '../config/site-config';
import { buildPackageReadmes } from '../package-readmes/build';
import { buildSearchIndexes } from '../search/build';
import { buildStaticRoutes } from '../static-routes/build';
import { syncManuals } from '../manual/sync';
import { syncManagedSkill } from '../skills/sync';
import packageJSON from '../../package.json' with { type: 'json' };

const [group, action, ...args] = process.argv.slice(2);

function usage(): void {
  console.info(
    `Usage:\n  galacean-docs api generate --config <path> [package-key...]\n  galacean-docs api extract --config <path> <snapshot-path...>\n  galacean-docs api apply --config <path> <task-path> <translation-path> [...pairs]\n  galacean-docs api snapshots clean --config <path>\n  galacean-docs manual sync --config <path>\n  galacean-docs package-readmes build --config <path>\n  galacean-docs search build --config <path>\n  galacean-docs routes build --config <path>\n  galacean-docs skills sync --config <path> [--check]`,
  );
}

function parseConfig(values: string[]): {
  config: string;
  remaining: string[];
} {
  const configIndex = values.indexOf('--config');
  const config = configIndex < 0 ? undefined : values[configIndex + 1];

  if (config === undefined || configIndex !== 0 || values.length < 2) {
    throw new Error('Provide --config <path>');
  }

  return { config, remaining: values.slice(2) };
}

if (group === '--help' || group === '-h') {
  usage();
} else if (group === 'api' && action === 'extract') {
  const { config: configFile, remaining: targetFiles } = parseConfig(args);

  if (
    targetFiles.length === 0 ||
    targetFiles.some(argument => argument.startsWith('--'))
  ) {
    throw new Error('Provide one or more API snapshot paths after --config');
  }
  const repositoryRoot = process.cwd();
  const config = await loadSiteConfig(configFile, repositoryRoot);
  const tasks = await extractTranslationTasks(targetFiles, config);

  for (const task of tasks) {
    console.info(
      `${task.taskPath}: ${task.fields} fields, ${task.packageKey}@${task.version} -> ${task.locale}`,
    );
  }
} else if (group === 'api' && action === 'generate') {
  const { config: configFile, remaining: packageKeys } = parseConfig(args);
  const config = await loadSiteConfig(configFile, process.cwd());
  const result = await generateAPIDocumentation(
    config,
    packageKeys.length === 0 ? undefined : packageKeys,
  );

  console.info(`API: ${result.packages} packages; ${result.exports} exports`);
  for (const warning of result.warnings) {
    console.warn(`[WARNING] ${warning}`);
  }
} else if (group === 'api' && action === 'apply') {
  const { config: configFile, remaining: files } = parseConfig(args);

  if (
    files.length === 0 ||
    files.length % 2 !== 0 ||
    files.some(argument => argument.startsWith('--'))
  ) {
    throw new Error(
      'Provide one or more task-path/translation-path pairs after --config',
    );
  }
  const repositoryRoot = process.cwd();
  const config = await loadSiteConfig(configFile, repositoryRoot);
  const pairs = [];

  for (let index = 0; index < files.length; index += 2) {
    const taskPath = files[index];
    const translationPath = files[index + 1];

    if (taskPath === undefined || translationPath === undefined) {
      throw new Error('Incomplete task/translation pair');
    }
    pairs.push({ taskPath, translationPath });
  }
  const updatedPaths = await applyTranslationPairs(pairs, config);

  for (const targetPath of updatedPaths) {
    console.info(`Updated ${targetPath}`);
  }
} else if (group === 'api' && action === 'snapshots') {
  const [snapshotAction, ...values] = args;

  if (snapshotAction !== 'clean') {
    throw new Error('Use api snapshots clean');
  }
  const { config: configFile, remaining } = parseConfig(values);

  if (remaining.length > 0) {
    throw new Error('api snapshots clean does not accept additional arguments');
  }
  const config = await loadSiteConfig(configFile, process.cwd());
  const result = await cleanAPISnapshots(config);
  const orphanedBytes = result.orphaned.reduce(
    (total, file) => total + file.bytes,
    0,
  );

  console.info(
    `API snapshots: ${result.referenced} referenced; ${result.deleted.length} deleted; ${(orphanedBytes / 1024 / 1024).toFixed(2)} MiB reclaimed`,
  );
  for (const file of result.orphaned) {
    console.info(`Deleted ${file.path} (${file.bytes} bytes)`);
  }
  for (const file of result.skipped) {
    console.warn(`[SKIPPED] ${file.path}: ${file.reason}`);
  }
} else if (group === 'search' && action === 'build') {
  const { config: configFile, remaining } = parseConfig(args);

  if (remaining.length > 0) {
    throw new Error('search build does not accept additional arguments');
  }
  const config = await loadSiteConfig(configFile, process.cwd());
  const counts = await buildSearchIndexes(config);

  for (const [locale, count] of Object.entries(counts)) {
    console.info(`${locale}: ${count} search results`);
  }
} else if (group === 'manual' && action === 'sync') {
  const { config: configFile, remaining } = parseConfig(args);

  if (remaining.length > 0) {
    throw new Error('manual sync does not accept additional arguments');
  }
  const config = await loadSiteConfig(configFile, process.cwd());
  const result = await syncManuals(config);

  console.info(
    `Manuals: ${result.collections} collections; ${result.documents} documents synchronized`,
  );
} else if (group === 'package-readmes' && action === 'build') {
  const { config: configFile, remaining } = parseConfig(args);

  if (remaining.length > 0) {
    throw new Error(
      'package-readmes build does not accept additional arguments',
    );
  }
  const config = await loadSiteConfig(configFile, process.cwd());
  const counts = await buildPackageReadmes(config);

  for (const [locale, count] of Object.entries(counts)) {
    console.info(`${locale}: ${count} package READMEs`);
  }
} else if (group === 'routes' && action === 'build') {
  const { config: configFile, remaining } = parseConfig(args);

  if (remaining.length > 0) {
    throw new Error('routes build does not accept additional arguments');
  }
  const config = await loadSiteConfig(configFile, process.cwd());
  const base = process.env['SITE_BASE_PATH'];
  const origin = process.env['VITE_SITE_ORIGIN'];
  const result = await buildStaticRoutes(config, {
    ...(base === undefined ? {} : { base }),
    ...(origin === undefined ? {} : { origin }),
  });

  console.info(
    `Static routes: ${result.routes}; ${(result.bytes / 1024 / 1024).toFixed(2)} MiB; base ${result.base}`,
  );
} else if (group === 'skills' && action === 'sync') {
  const check = args.includes('--check');
  const { config, remaining } = parseConfig(
    args.filter(argument => argument !== '--check'),
  );

  if (remaining.length > 0) {
    usage();
    process.exitCode = 2;
  } else {
    const repositoryRoot = process.cwd();

    await loadSiteConfig(config, repositoryRoot);
    for (const skillName of [
      'api-documentation-translation',
      'manual-documentation-translation',
    ]) {
      const sourceDirectory = fileURLToPath(
        new URL(`../../skills/${skillName}/`, import.meta.url),
      );
      const result = await syncManagedSkill({
        repositoryRoot,
        sourceDirectory,
        packageVersion: packageJSON.version,
        skillName,
        check,
      });

      console.info(
        `${check ? 'Verified' : result.changed ? 'Synchronized' : 'Already current'}: ${result.targetDirectory}`,
      );
    }
  }
} else {
  usage();
  process.exitCode = 2;
}
