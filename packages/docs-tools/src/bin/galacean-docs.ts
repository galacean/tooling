#!/usr/bin/env node
import { applyTranslationPairs } from '../api/apply';
import { cleanAPISnapshots } from '../api/snapshot-cleanup';
import { extractTranslationTasks } from '../api/extract';
import { getAPIStatus } from '../api/status';
import { migrateAPITranslations } from '../api/migrate-translations';
import { synchronizeAPILocales } from '../api/locales';
import { loadDocsProjectConfig } from '../config/load-project-config';
import { buildPackageReadmes } from '../package-readmes/build';
import { buildSearchIndexes } from '../search/build';
import { buildStaticRoutes } from '../static-routes/build';
import { syncManuals } from '../manual/sync';
import { migrateManualTranslations } from '../manual/migrate-translations';
import { syncBundledSkills } from '../skills/sync-bundled';
import { parseTranslationSelection } from '../translations/selection';
import type { TranslationSelectionOptions } from '../translations/selection';
import { getCommonMessageIssues } from '@galacean/docs-site';
import { extractDocumentTranslations, applyDocumentTranslations, getDocumentTranslationStatus } from '../translations/documents';
import { createCommandLogger } from './command-logger';

const [group, action, ...args] = process.argv.slice(2);

function usage(): void {
  console.info(`Usage:
  galacean-docs api generate --config <path> [--version <tag>] [--force] [package-key...]
  galacean-docs api extract --config <path> [--version <tag>] [translation options] [snapshot-path...]
  galacean-docs api apply --config <path> <task-path> <translation-path> [...pairs]
  galacean-docs api status --config <path> [--version <tag>]
  galacean-docs api locales sync --config <path> [--version <tag>]
  galacean-docs api translations migrate --config <path> [--version <tag>]
  galacean-docs api snapshots clean --config <path>
  galacean-docs manual sync --config <path>
  galacean-docs manual extract --config <path> [translation options]
  galacean-docs manual apply --config <path> <task-path> <translation-path> [...pairs]
  galacean-docs manual translations migrate --config <path> <collection> <locale> <legacy-dir> [...mappings]
  galacean-docs package-readmes build --config <path>
  galacean-docs package-readmes extract --config <path> [translation options]
  galacean-docs package-readmes apply --config <path> <task-path> <translation-path> [...pairs]
  galacean-docs translations status --config <path>
  galacean-docs translations check --config <path> [--require-complete]
  galacean-docs search build --config <path>
  galacean-docs routes build --config <path>
  galacean-docs skills sync [--check]

Translation options:
  --source-locale <locale|all> --target-locales <locale[,locale...]|all>
  --locale <locale> (single-target alias, exclusive with --target-locales)
  --packages <key[,key...]> --collections <key[,key...]> --pages <slug[,slug...]>
  --dry-run (read-only preview)`);
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

function parseExtractOptions(values: string[]): TranslationSelectionOptions & { targetFiles: string[]; version?: string } {
  const { options, remaining } = parseTranslationSelection(values);
  const targetFiles: string[] = [];
  let version: string | undefined;

  for (let i = 0; i < remaining.length; i++) {
    const argument = remaining[i]!;

    if (argument === '--version') {
      const selected = remaining[++i];

      if (version !== undefined || selected === undefined || selected.startsWith('--')) {
        throw new Error('Provide --version <tag> only once');
      }
      version = selected;
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown extraction option: ${argument}`);
    } else {
      targetFiles.push(argument);
    }
  }
  if (targetFiles.length > 0 && (version !== undefined || Object.keys(options).some(key => key !== 'dryRun'))) {
    throw new Error('Translation selections and --version are only used without snapshot paths');
  }

  return { ...options, targetFiles, ...(version === undefined ? {} : { version }) };
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
} else if ((group === 'manual' || group === 'package-readmes') && (action === 'extract' || action === 'apply')) {
  const { config: configFile, remaining } = parseConfig(args);
  const config = await loadDocsProjectConfig(configFile, process.cwd());

  if (action === 'extract') {
    const { options, remaining: unknown } = parseTranslationSelection(remaining);

    if (unknown.length > 0 || group === 'manual' && options.packages !== undefined ||
      group === 'package-readmes' && (options.collections !== undefined || options.pages !== undefined)) {
      throw new Error(`Invalid ${group} extraction options`);
    }
    const tasks = await extractDocumentTranslations(group, config, options);

    for (const task of tasks) {
      console.info(`${task.taskPath || '(preview)'}: ${task.owner}/${task.key} -> ${task.locale} (${task.status})`);
    }
    console.info(`${tasks.length} pending document translation tasks${options.dryRun === true ? ' (dry run)' : ''}`);
  } else {
    if (remaining.length === 0 || remaining.length % 2 !== 0 || remaining.some(value => value.startsWith('--'))) {
      throw new Error('Provide task-path/translation-path pairs');
    }
    const pairs = [];

    for (let i = 0; i < remaining.length; i += 2) {
      pairs.push({ taskPath: remaining[i]!, translationPath: remaining[i + 1]! });
    }
    const outputs = await applyDocumentTranslations(group, config, pairs);

    outputs.forEach(filename => console.info(`Archived ${filename}`));
  }
} else if (group === 'translations' && (action === 'status' || action === 'check')) {
  const { config: configFile, remaining } = parseConfig(args);
  const requireComplete = remaining.includes('--require-complete');

  if (remaining.some(value => value !== '--require-complete') || new Set(remaining).size !== remaining.length || action === 'status' && requireComplete) {
    throw new Error('Use translations check [--require-complete] or translations status');
  }
  const config = await loadDocsProjectConfig(configFile, process.cwd());
  let incomplete = 0;

  for (const locale of config.locales) {
    for (const issue of getCommonMessageIssues(locale, config.i18n)) {
      console.info(`UI: missing ${issue}`);
      incomplete++;
    }
  }
  for (const kind of ['manual', 'package-readmes'] as const) {
    const statuses = await getDocumentTranslationStatus(kind, config);

    for (const { document, locale, translation } of statuses) {
      console.info(`${kind}/${document.owner}/${document.key}/${locale}: ${translation.status}`);
      if (translation.status !== 'translated') {
        incomplete++;
      }
    }
  }
  if (config.apiVersions !== undefined) {
    for (const item of await getAPIStatus(config)) {
      console.info(`API ${item.version}: ${item.generation.status}`);
      if (item.generation.status !== 'complete') {
        incomplete++;
      }
      for (const translation of item.translations) {
        console.info(`API ${translation.packageKey}@${item.version}/${translation.locale}: ${translation.status}`);
        if (translation.status !== 'complete') {
          incomplete++;
        }
      }
    }
  }
  console.info(`${incomplete} incomplete translation items`);
  if (action === 'check' && requireComplete && incomplete > 0) {
    process.exitCode = 1;
  }
} else if (group === 'api' && action === 'extract') {
  const { config: configFile, remaining } = parseConfig(args);
  const { targetFiles, version, ...selection } = parseExtractOptions(remaining);
  const repositoryRoot = process.cwd();
  const config = await loadDocsProjectConfig(configFile, repositoryRoot);
  const logger = createCommandLogger('api extract');

  logger.info(
    targetFiles.length > 0
      ? `Extracting ${targetFiles.length} API snapshots`
      : `Selecting pending API translations${version === undefined ? ' for latest version' : ` for ${version}`}${selection.targetLocales === undefined ? '' : ` in ${String(selection.targetLocales)}`}`,
  );
  const tasks = await extractTranslationTasks(targetFiles, config, {
    ...(version === undefined ? {} : { version }),
    ...selection,
  });

  for (const task of tasks) {
    logger.success(
      `${task.taskPath || '(preview)'}: ${task.fields} fields, ${task.packageKey}@${task.version} -> ${task.locale}`,
    );
  }
  logger.success(
    tasks.length === 0
      ? 'No pending API translations'
      : `${selection.dryRun === true ? 'Previewed' : 'Created'} ${tasks.length} translation tasks`,
  );
} else if (group === 'api' && action === 'locales') {
  const [operation, ...values] = args;

  if (operation !== 'sync') {
    throw new Error('Use api locales sync');
  }
  const { config: configFile, remaining } = parseConfig(values);
  const { version } = parseStatusOptions(remaining);
  const result = await synchronizeAPILocales(await loadDocsProjectConfig(configFile, process.cwd()), version);

  console.info(`Synchronized API locales for ${result.versions} versions`);
  result.warnings.forEach(warning => console.warn(warning));
} else if (group === 'api' && action === 'generate') {
  const { config: configFile, remaining } = parseConfig(args);
  const { packageKeys, version, force } = parseGenerateOptions(remaining);
  const config = await loadDocsProjectConfig(configFile, process.cwd());
  const logger = createCommandLogger('api generate');

  logger.info(
    packageKeys.length === 0
      ? 'Generating API documentation for all packages'
      : `Generating API documentation for ${packageKeys.join(', ')}`,
  );
  const { generateAPIDocumentation } = await import('../api/generate');
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
  const config = await loadDocsProjectConfig(configFile, process.cwd());
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
  const config = await loadDocsProjectConfig(configFile, process.cwd());
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
  const config = await loadDocsProjectConfig(configFile, repositoryRoot);
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
  const config = await loadDocsProjectConfig(configFile, process.cwd());
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
  const config = await loadDocsProjectConfig(configFile, process.cwd());
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
  const config = await loadDocsProjectConfig(configFile, process.cwd());
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
  const config = await loadDocsProjectConfig(configFile, process.cwd());
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
  const config = await loadDocsProjectConfig(configFile, process.cwd());
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
  const config = await loadDocsProjectConfig(configFile, process.cwd());
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
