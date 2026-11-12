#!/usr/bin/env node
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
import { syncBundledSkills } from '../skills/sync-bundled';
import { createCommandLogger } from './command-logger';

const [group, action, ...args] = process.argv.slice(2);

function usage(): void {
  console.info(
    `Usage:\n  galacean-docs api generate --config <path> [package-key...]\n  galacean-docs api extract --config <path> <snapshot-path...>\n  galacean-docs api apply --config <path> <task-path> <translation-path> [...pairs]\n  galacean-docs api snapshots clean --config <path>\n  galacean-docs manual sync --config <path>\n  galacean-docs package-readmes build --config <path>\n  galacean-docs search build --config <path>\n  galacean-docs routes build --config <path>\n  galacean-docs skills sync [--check]`,
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
  const logger = createCommandLogger('api extract');

  logger.info(`Extracting ${targetFiles.length} API snapshots`);
  const tasks = await extractTranslationTasks(targetFiles, config);

  for (const task of tasks) {
    logger.success(
      `${task.taskPath}: ${task.fields} fields, ${task.packageKey}@${task.version} -> ${task.locale}`,
    );
  }
  logger.success(`Created ${tasks.length} translation tasks`);
} else if (group === 'api' && action === 'generate') {
  const { config: configFile, remaining: packageKeys } = parseConfig(args);
  const config = await loadSiteConfig(configFile, process.cwd());
  const logger = createCommandLogger('api generate');

  logger.info(
    packageKeys.length === 0
      ? 'Generating API documentation for all packages'
      : `Generating API documentation for ${packageKeys.join(', ')}`,
  );
  const result = await generateAPIDocumentation(
    config,
    packageKeys.length === 0 ? undefined : packageKeys,
  );

  logger.success(`API: ${result.packages} packages; ${result.exports} exports`);
  for (const warning of result.warnings) {
    logger.warn(warning);
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
  const logger = createCommandLogger('api apply');

  logger.info(`Applying ${pairs.length} translation pairs`);
  const updatedPaths = await applyTranslationPairs(pairs, config);

  for (const targetPath of updatedPaths) {
    logger.success(`Updated ${targetPath}`);
  }
  logger.success(`Updated ${updatedPaths.length} API files`);
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
  const logger = createCommandLogger('api snapshots clean');

  logger.info('Cleaning orphan API snapshots');
  const result = await cleanAPISnapshots(config);
  const orphanedBytes = result.orphaned.reduce(
    (total, file) => total + file.bytes,
    0,
  );

  logger.success(
    `API snapshots: ${result.referenced} referenced; ${result.deleted.length} deleted; ${(orphanedBytes / 1024 / 1024).toFixed(2)} MiB reclaimed`,
  );
  for (const file of result.orphaned) {
    logger.info(`Deleted ${file.path} (${file.bytes} bytes)`);
  }
  for (const file of result.skipped) {
    logger.warn(`Skipped ${file.path}: ${file.reason}`);
  }
} else if (group === 'search' && action === 'build') {
  const { config: configFile, remaining } = parseConfig(args);

  if (remaining.length > 0) {
    throw new Error('search build does not accept additional arguments');
  }
  const config = await loadSiteConfig(configFile, process.cwd());
  const logger = createCommandLogger('search build');

  logger.info('Building localized search indexes');
  const counts = await buildSearchIndexes(config);

  for (const [locale, count] of Object.entries(counts)) {
    logger.success(`${locale}: ${count} search results`);
  }
} else if (group === 'manual' && action === 'sync') {
  const { config: configFile, remaining } = parseConfig(args);

  if (remaining.length > 0) {
    throw new Error('manual sync does not accept additional arguments');
  }
  const config = await loadSiteConfig(configFile, process.cwd());
  const logger = createCommandLogger('manual sync');

  logger.info('Starting manual sync');
  const result = await syncManuals(config, globalThis.fetch, progress => {
    if (progress.type === 'collection-ready') {
      logger.info(
        `Collection ${progress.collectionKey} (${progress.sourceType}): ${progress.total} files queued`,
      );
      for (const group of progress.groups) {
        const groupName = group.name.length > 0 ? group.name : '(ungrouped)';
        const label = progress.sourceType === 'yuque' ? 'Yuque group' : 'Group';

        logger.info(`${label} ${groupName}: ${group.files} files`);
      }

      return;
    }
    const status = progress.status === 'syncing' ? 'Syncing' : 'Prepared';
    const name =
      progress.status === 'prepared' ? progress.title : progress.slug;
    const group = progress.group.length > 0 ? `${progress.group} / ` : '';
    const message = `[${progress.index}/${progress.total}] ${status}: ${group}${name ?? progress.slug}`;

    if (progress.status === 'syncing') {
      logger.info(message);
    } else {
      logger.success(message);
    }
  });

  logger.success(
    `Complete: ${result.documents} files across ${result.collections} collections`,
  );
} else if (group === 'package-readmes' && action === 'build') {
  const { config: configFile, remaining } = parseConfig(args);

  if (remaining.length > 0) {
    throw new Error(
      'package-readmes build does not accept additional arguments',
    );
  }
  const config = await loadSiteConfig(configFile, process.cwd());
  const logger = createCommandLogger('package-readmes build');

  logger.info('Building package README data');
  const counts = await buildPackageReadmes(config);

  for (const [locale, count] of Object.entries(counts)) {
    logger.success(`${locale}: ${count} package READMEs`);
  }
} else if (group === 'routes' && action === 'build') {
  const { config: configFile, remaining } = parseConfig(args);

  if (remaining.length > 0) {
    throw new Error('routes build does not accept additional arguments');
  }
  const config = await loadSiteConfig(configFile, process.cwd());
  const logger = createCommandLogger('routes build');
  const base = process.env['SITE_BASE_PATH'];
  const origin = process.env['VITE_SITE_ORIGIN'];

  logger.info('Building static routes');
  const result = await buildStaticRoutes(config, {
    ...(base === undefined ? {} : { base }),
    ...(origin === undefined ? {} : { origin }),
  });

  logger.success(
    `Static routes: ${result.routes}; ${(result.bytes / 1024 / 1024).toFixed(2)} MiB; base ${result.base}`,
  );
} else if (group === 'skills' && action === 'sync') {
  const check = args.includes('--check');
  const remaining = args.filter(argument => argument !== '--check');

  if (remaining.length > 0) {
    usage();
    process.exitCode = 2;
  } else {
    const logger = createCommandLogger('skills sync');
    const results = await syncBundledSkills({
      repositoryRoot: process.cwd(),
      check,
    });

    for (const result of results) {
      const level = check || result.changed ? 'SUCCESS' : 'INFO';

      if (level === 'SUCCESS') {
        logger.success(
          `${check ? 'Verified' : 'Synchronized'}: ${result.targetDirectory}`,
        );
      } else {
        logger.info(`Already current: ${result.targetDirectory}`);
      }
    }
  }
} else {
  usage();
  process.exitCode = 2;
}
