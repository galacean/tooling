#!/usr/bin/env node
import {
  applyTranslationPairs,
  cleanAPISnapshots,
  extractTranslationTasks,
  generateAPIDocumentation,
  getAPIStatus,
  migrateAPITranslations,
} from '../api';
import { loadSiteConfig } from '../config/site-config';
import { buildPackageReadmes } from '../package-readmes/build';
import { buildSearchIndexes } from '../search/build';
import { buildStaticRoutes } from '../static-routes/build';
import { syncManuals } from '../manual/sync';
import { migrateManualTranslations } from '../manual/migrate-translations';
import { syncBundledSkills } from '../skills/sync-bundled';
import { createCommandLogger } from './command-logger';

const [group, action, ...args] = process.argv.slice(2);

function usage(): void {
  console.info(
    `Usage:\n  galacean-docs api generate --config <path> [--version <tag>] [--force] [package-key...]\n  galacean-docs api extract --config <path> [--version <tag>] [--locale <locale>] [snapshot-path...]\n  galacean-docs api apply --config <path> <task-path> <translation-path> [...pairs]\n  galacean-docs api status --config <path> [--version <tag>]\n  galacean-docs api snapshots clean --config <path>\n  galacean-docs manual sync --config <path>\n  galacean-docs package-readmes build --config <path>\n  galacean-docs search build --config <path>\n  galacean-docs routes build --config <path>\n  galacean-docs skills sync [--check]`,
    `Usage:\n  galacean-docs api generate --config <path> [--version <tag>] [--force] [package-key...]\n  galacean-docs api extract --config <path> [--version <tag>] [--locale <locale>] [snapshot-path...]\n  galacean-docs api apply --config <path> <task-path> <translation-path> [...pairs]\n  galacean-docs api status --config <path> [--version <tag>]\n  galacean-docs api translations migrate --config <path> [--version <tag>]\n  galacean-docs api snapshots clean --config <path>\n  galacean-docs manual sync --config <path>\n  galacean-docs manual translations migrate --config <path> <collection> <locale> <legacy-dir> [...mappings]\n  galacean-docs package-readmes build --config <path>\n  galacean-docs search build --config <path>\n  galacean-docs routes build --config <path>\n  galacean-docs skills sync [--check]`,
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

function parseGenerateOptions(values: string[]): {
  packageKeys: string[];
  version?: string;
  force: boolean;
} {
  const packageKeys: string[] = [];
  let version: string | undefined;
  let force = false;

  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];

    if (argument === '--version') {
      const selectedVersion = values[index + 1];

      if (selectedVersion === undefined || selectedVersion.startsWith('--')) {
        throw new Error('Provide a version after --version');
      }
      if (version !== undefined) {
        throw new Error('Provide --version only once');
      }
      version = selectedVersion;
      index += 1;
    } else if (argument === '--force') {
      if (force === true) {
        throw new Error('Provide --force only once');
      }
      force = true;
    } else if (argument !== undefined && argument.startsWith('--')) {
      throw new Error(`Unknown api generate option: ${argument}`);
    } else if (argument !== undefined) {
      packageKeys.push(argument);
    }
  }

  return { packageKeys, ...(version === undefined ? {} : { version }), force };
}

function parseExtractOptions(values: string[]): {
  targetFiles: string[];
  version?: string;
  locale?: string;
} {
  const targetFiles: string[] = [];
  let version: string | undefined;
  let locale: string | undefined;

  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];

    if (argument === '--version' || argument === '--locale') {
      const optionValue = values[index + 1];

      if (optionValue === undefined || optionValue.startsWith('--')) {
        throw new Error(`Provide a value after ${argument}`);
      }
      if (argument === '--version') {
        if (version !== undefined) {
          throw new Error('Provide --version only once');
        }
        version = optionValue;
      } else {
        if (locale !== undefined) {
          throw new Error('Provide --locale only once');
        }
        locale = optionValue;
      }
      index += 1;
    } else if (argument !== undefined && argument.startsWith('--')) {
      throw new Error(`Unknown api extract option: ${argument}`);
    } else if (argument !== undefined) {
      targetFiles.push(argument);
    }
  }

  if (targetFiles.length > 0 && (version !== undefined || locale !== undefined)) {
    throw new Error('--version and --locale are only used without snapshot paths');
  }

  return {
    targetFiles,
    ...(version === undefined ? {} : { version }),
    ...(locale === undefined ? {} : { locale }),
  };
}

function parseStatusOptions(values: string[]): { version?: string } {
  if (values.length === 0) {
    return {};
  }
  if (
    values.length !== 2 ||
    values[0] !== '--version' ||
    values[1] === undefined ||
    values[1].startsWith('--')
  ) {
    throw new Error('api status accepts only --version <tag>');
  }

  return { version: values[1] };
}

if (group === '--help' || group === '-h') {
  usage();
} else if (group === 'api' && action === 'extract') {
  const { config: configFile, remaining } = parseConfig(args);
  const { targetFiles, version, locale } = parseExtractOptions(remaining);
  const repositoryRoot = process.cwd();
  const config = await loadSiteConfig(configFile, repositoryRoot);
  const logger = createCommandLogger('api extract');

  logger.info(
    targetFiles.length > 0
      ? `Extracting ${targetFiles.length} API snapshots`
      : `Selecting pending API translations${version === undefined ? ' for latest version' : ` for ${version}`}${locale === undefined ? '' : ` in ${locale}`}`,
  );
  const tasks = await extractTranslationTasks(targetFiles, config, {
    ...(version === undefined ? {} : { version }),
    ...(locale === undefined ? {} : { locale }),
  });

  for (const task of tasks) {
    logger.success(
      `${task.taskPath}: ${task.fields} fields, ${task.packageKey}@${task.version} -> ${task.locale}`,
    );
  }
  logger.success(
    tasks.length === 0
      ? 'No pending API translations'
      : `Created ${tasks.length} translation tasks`,
  );
} else if (group === 'api' && action === 'generate') {
  const { config: configFile, remaining } = parseConfig(args);
  const { packageKeys, version, force } = parseGenerateOptions(remaining);
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
    undefined,
    item =>
      logger.info(
        `${item.version}: ${item.status}${item.reason === undefined ? '' : ` (${item.reason})`}`,
      ),
      { ...(version === undefined ? {} : { version }), force },
  );

  logger.success(`API: ${result.packages} packages; ${result.exports} exports`);
  for (const warning of result.warnings) {
    logger.warn(warning);
  }
} else if (group === 'api' && action === 'status') {
  const { config: configFile, remaining } = parseConfig(args);
  const { version } = parseStatusOptions(remaining);
  const config = await loadSiteConfig(configFile, process.cwd());
  const logger = createCommandLogger('api status');
  const statuses = await getAPIStatus(config, version);

  for (const item of statuses) {
    logger.info(
      `${item.version}: generation ${item.generation.status}${item.generation.status === 'invalid' ? ` (${item.generation.reason})` : ''}`,
    );
    for (const translation of item.translations) {
      logger.info(
        `  ${translation.packageKey}/${translation.locale}: ${translation.status}${translation.reason === undefined ? '' : ` (${translation.reason})`}`,
      );
    }
  }
  logger.success(`Reported ${statuses.length} API version statuses`);
} else if (group === 'api' && action === 'translations') {
  const [migrationAction, ...values] = args;

  if (migrationAction !== 'migrate') {
    throw new Error('Use api translations migrate');
  }
  const { config: configFile, remaining } = parseConfig(values);
  const { version } = parseStatusOptions(remaining);
  const config = await loadSiteConfig(configFile, process.cwd());
  const logger = createCommandLogger('api translations migrate');
  const result = await migrateAPITranslations(config, version);

  logger.success(`Migrated ${result.migrated} API translation archives`);
  for (const item of result.skipped) {
    logger.warn(`${item.packageKey}@${item.version}/${item.locale}: ${item.reason}`);
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
    if (progress.type === 'warning') {
      logger.warn(progress.message);

      return;
    }
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
} else if (group === 'manual' && action === 'translations') {
  const [migrationAction, ...values] = args;

  if (migrationAction !== 'migrate') {
    throw new Error('Use manual translations migrate');
  }
  const { config: configFile, remaining } = parseConfig(values);

  if (remaining.length === 0 || remaining.length % 3 !== 0) {
    throw new Error(
      'Provide collection/locale/legacy-directory triples after --config',
    );
  }
  const config = await loadSiteConfig(configFile, process.cwd());
  const mappings = [];

  for (let index = 0; index < remaining.length; index += 3) {
    const collectionKey = remaining[index];
    const locale = remaining[index + 1];
    const legacyDirectory = remaining[index + 2];

    if (
      collectionKey === undefined ||
      locale === undefined ||
      legacyDirectory === undefined ||
      [collectionKey, locale, legacyDirectory].some(value => value.startsWith('--'))
    ) {
      throw new Error('Invalid manual translation migration mapping');
    }
    mappings.push({ collectionKey, locale, legacyDirectory });
  }
  const logger = createCommandLogger('manual translations migrate');
  const result = await migrateManualTranslations(config, mappings);

  logger.success(`Migrated ${result.migrated} manual translations`);
  if (result.skipped > 0) {
    logger.warn(`Skipped ${result.skipped} empty, invalid, or existing translations`);
  }
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
