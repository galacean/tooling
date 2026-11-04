import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'vitest';
import { ReflectionKind } from 'typedoc';
import { generateAPIDocumentation } from '@galacean/docs-tools';
import type {
  APIGenerationDependencies,
  DocsSiteConfig,
} from '@galacean/docs-tools';

const execFileAsync = promisify(execFile);

async function fixture() {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'docs-api-generate-'),
  );
  const packageDirectory = path.join(repositoryRoot, 'packages/widget-dir');
  const sourcePath = path.join(packageDirectory, 'src/index.ts');
  const typesPath = path.join(packageDirectory, 'dist/index.d.ts');
  const tsconfigPath = path.join(packageDirectory, 'tsconfig.json');
  const apiDirectory = path.join(repositoryRoot, 'site/public/data/api');

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await mkdir(path.dirname(typesPath), { recursive: true });
  await writeFile(
    sourcePath,
    'export interface Widget { title: string; }\nexport interface SourceOnly { value: string; }\n',
  );
  await writeFile(typesPath, 'export interface Widget { title: string; }\n');
  await writeFile(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        composite: true,
        declaration: true,
        emitDeclarationOnly: true,
        outDir: 'dist',
      },
      include: ['src/**/*.ts'],
    }),
  );
  await writeFile(
    path.join(packageDirectory, 'package.json'),
    JSON.stringify({
      name: '@example/real-widget',
      version: '1.2.3',
      type: 'module',
      module: './dist/index.js',
      main: './dist/index.js',
      types: './dist/index.d.ts',
      files: ['dist'],
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      },
    }),
  );
  const config: DocsSiteConfig = {
    repositoryRoot,
    configPath: path.join(repositoryRoot, 'site/site.config.ts'),
    sourceLocale: 'en',
    locales: ['en', 'zh-CN'],
    apiDirectory,
    translationWorkDirectory: path.join(
      repositoryRoot,
      'tmp/docs-tools/api-translation',
    ),
    apiPackages: [
      {
        key: 'widget-dir',
        name: '@example/real-widget',
        directory: packageDirectory,
        tsconfig: tsconfigPath,
        entries: [{ key: 'root', source: sourcePath, types: typesPath }],
      },
    ],
  };
  const project = {
    schemaVersion: '2.0',
    id: 1,
    name: 'Fixture',
    kind: 1,
    variant: 'project',
    flags: {},
    symbolIdMap: {
      11: {
        packageName: '@example/real-widget',
        packagePath: 'dist/index.d.ts',
        qualifiedName: 'Widget',
      },
    },
    files: { entries: {}, reflections: {} },
    children: [
      {
        id: 10,
        name: '@example/real-widget',
        kind: ReflectionKind.Module,
        variant: 'declaration',
        flags: {},
        sources: [{ fileName: 'packages/widget-dir/src/index.ts', line: 1 }],
        children: [
          {
            id: 12,
            name: 'index',
            kind: ReflectionKind.Module,
            variant: 'declaration',
            flags: {},
            children: [
              {
                id: 11,
                name: 'Widget',
                kind: 256,
                variant: 'declaration',
                flags: {},
                comment: { summary: [{ kind: 'text', text: 'A widget.' }] },
              },
            ],
          },
        ],
      },
    ],
  };
  const dependencies: APIGenerationDependencies = {
    buildDeclarations: async () => undefined,
    convert: async () => project as never,
    getCommit: () => 'c'.repeat(40),
    generatorVersion: async () => '0.28.20',
  };

  return {
    repositoryRoot,
    apiDirectory,
    packageDirectory,
    config,
    dependencies,
  };
}

void test('generates package-key snapshots after checking real package name and public exports', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  const result = await generateAPIDocumentation(
    values.config,
    undefined,
    values.dependencies,
  );

  assert.equal(result.packages, 1);
  assert.equal(result.exports, 1);
  assert.ok(result.warnings.some(warning => warning.includes('zh-CN')));
  await assert.doesNotReject(
    import('node:fs/promises').then(fs =>
      fs.access(path.join(values.apiDirectory, 'widget-dir/1.2.3/en.api.json')),
    ),
  );
});

void test('rejects a package name mismatch before invoking the TypeDoc converter', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  await writeFile(
    path.join(values.packageDirectory, 'package.json'),
    JSON.stringify({
      name: '@example/wrong-name',
      version: '1.2.3',
      types: './dist/index.d.ts',
    }),
  );
  let converted = false;

  await assert.rejects(
    generateAPIDocumentation(values.config, undefined, {
      ...values.dependencies,
      convert: async (...args) => {
        converted = true;

        return values.dependencies.convert(...args);
      },
    }),
    /Package manifest does not match/u,
  );
  assert.equal(converted, false);
});

void test('runs api generate through the mjs CLI with an isolated TypeDoc package', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  const siteDirectory = path.join(values.repositoryRoot, 'site');
  const secondPackage = path.join(values.repositoryRoot, 'packages/second');
  const configPath = path.join(siteDirectory, 'site.config.ts');
  const cliPath = path.resolve(import.meta.dirname, '../bin/galacean-docs.mjs');

  await mkdir(siteDirectory, { recursive: true });
  await mkdir(path.join(secondPackage, 'src'), { recursive: true });
  await writeFile(
    path.join(secondPackage, 'src/public.ts'),
    'export interface SecondWidget { id: string; }\n',
  );
  await writeFile(
    path.join(secondPackage, 'package.json'),
    JSON.stringify({
      name: '@example/second-widget',
      version: '2.0.0',
      type: 'module',
      types: './dist/index.d.ts',
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      },
    }),
  );
  await writeFile(
    path.join(secondPackage, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        composite: true,
        rootDir: 'src',
        declaration: true,
        emitDeclarationOnly: true,
        outDir: 'dist',
      },
      include: ['src/**/*.ts'],
    }),
  );
  await writeFile(
    path.join(values.repositoryRoot, 'pnpm-workspace.yaml'),
    'packages:\n  - packages/*\n',
  );
  await writeFile(
    configPath,
    `export default ${JSON.stringify({
      sourceLocale: 'en',
      locales: ['en', 'zh-CN'],
      api: {
        dataDirectory: 'site/public/data/api',
        sourceLinkTemplate: 'https://example.test/blob/{commit}/{path}#L{line}',
        packages: [
          {
            key: 'widget-dir',
            name: '@example/real-widget',
            directory: 'packages/widget-dir',
            tsconfig: 'tsconfig.json',
            entries: [
              { key: 'root', source: 'src/index.ts', types: 'dist/index.d.ts' },
            ],
          },
          {
            key: 'second',
            name: '@example/second-widget',
            directory: 'packages/second',
            tsconfig: 'tsconfig.json',
            entries: [
              {
                key: 'public',
                source: 'src/public.ts',
                types: 'dist/public.d.ts',
              },
            ],
          },
        ],
      },
      translationWorkDirectory: 'tmp/docs-tools/api-translation',
    })} as const;\n`,
  );
  await execFileAsync('git', ['init', '--quiet'], {
    cwd: values.repositoryRoot,
  });
  await execFileAsync(
    'git',
    ['config', 'user.email', 'docs-tools@example.test'],
    { cwd: values.repositoryRoot },
  );
  await execFileAsync('git', ['config', 'user.name', 'Docs Tools Test'], {
    cwd: values.repositoryRoot,
  });
  await execFileAsync('git', ['add', '--all'], { cwd: values.repositoryRoot });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'fixture'], {
    cwd: values.repositoryRoot,
  });
  const result = await execFileAsync(
    process.execPath,
    [cliPath, 'api', 'generate', '--config', 'site/site.config.ts'],
    { cwd: values.repositoryRoot },
  );
  const manifest = JSON.parse(
    await readFile(path.join(values.apiDirectory, 'manifest.json'), 'utf8'),
  ) as {
    packages: {
      key: string;
      name: string;
      current: { json: Record<string, string> };
    }[];
  };

  assert.match(result.stdout, /API: 2 packages; 2 exports/u);
  assert.equal(manifest.packages[0]?.key, 'widget-dir');
  assert.equal(manifest.packages[0]?.name, '@example/real-widget');
  assert.equal(
    manifest.packages[0]?.current.json['en'],
    'api/widget-dir/1.2.3/en.api.json',
  );
  assert.equal(manifest.packages[1]?.key, 'second');
  assert.equal(manifest.packages[1]?.name, '@example/second-widget');
}, 15_000);
