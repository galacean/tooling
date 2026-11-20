import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'vitest';
import { ReflectionKind } from 'typedoc';
import {
  externalizeTypeDocDependencies,
  generateAPIDocumentation,
} from '@galacean/docs-tools';
import type {
  APIDocumentationPackage,
  APIGenerationDependencies,
  ResolvedDocsBuildConfig,
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
  const config: ResolvedDocsBuildConfig = {
    repositoryRoot,
    configPath: path.join(repositoryRoot, 'site/site.config.ts'),
    sourceLocale: 'en',
    locales: ['en', 'zh-CN'],
    apiDirectory,
    manualDirectory: path.join(repositoryRoot, 'site/public/data/manual'),
    apiTranslationDirectory: path.join(
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
    getCommit: () => 'a'.repeat(40),
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

void test('externalizes dependency trees while preserving public external exports as linked stubs', () => {
  const project = {
    schemaVersion: '2.0',
    id: 1,
    name: 'Fixture',
    kind: 1,
    variant: 'project',
    flags: {},
    symbolIdMap: {
      11: {
        packageName: '@galacean/effects-math',
        packagePath: 'es/box2.d.ts',
        qualifiedName: 'Box2',
      },
      13: {
        packageName: '@galacean/effects-math',
        packagePath: 'es/vector2.d.ts',
        qualifiedName: 'Vector2',
      },
    },
    files: { entries: {}, reflections: {} },
    children: [
      {
        id: 2,
        name: '@example/widget',
        kind: ReflectionKind.Module,
        variant: 'declaration',
        flags: {},
        children: [
          {
            id: 11,
            name: 'Box2',
            kind: ReflectionKind.Class,
            variant: 'declaration',
            flags: { isExternal: true },
            children: [
              {
                id: 12,
                name: 'min',
                kind: ReflectionKind.Property,
                variant: 'declaration',
                flags: { isExternal: true },
              },
            ],
          },
          {
            id: 13,
            name: 'Vector2',
            kind: ReflectionKind.Class,
            variant: 'declaration',
            flags: { isExternal: true },
          },
          {
            id: 14,
            name: 'makeBox',
            kind: ReflectionKind.Function,
            variant: 'declaration',
            flags: {},
            signatures: [
              {
                id: 15,
                name: 'makeBox',
                kind: ReflectionKind.CallSignature,
                variant: 'signature',
                flags: {},
                type: {
                  type: 'reference',
                  name: 'Vector2',
                  target: 13,
                  package: '@galacean/effects-math',
                },
              },
            ],
          },
        ],
      },
    ],
  } as unknown as import('typedoc').JSONOutput.ProjectReflection;
  const packages = [
    {
      key: 'widget',
      name: '@example/widget',
      version: '1.0.0',
      entries: [
        {
          key: 'root',
          source: 'src/index.ts',
          types: 'dist/index.d.ts',
          id: 2,
          symbols: [{ name: 'Box2', id: 11, kind: ReflectionKind.Class }],
        },
      ],
    },
  ] satisfies APIDocumentationPackage[];

  const externalized = externalizeTypeDocDependencies(
    project,
    packages,
    'zh-CN',
  );
  const module = externalized.children?.[0];
  const box = module?.children?.find(child => child.name === 'Box2');
  const makeBox = module?.children?.find(child => child.name === 'makeBox');
  const vectorType = (
    makeBox?.signatures?.[0] as { type?: { externalUrl?: string } } | undefined
  )?.type;

  assert.deepEqual(
    module?.children?.map(child => child.name),
    ['Box2', 'makeBox'],
  );
  assert.deepEqual(box, {
    id: 11,
    name: 'Box2',
    kind: ReflectionKind.Class,
    variant: 'declaration',
    flags: { isExternal: true },
    comment: {
      summary: [
        {
          kind: 'text',
          text: '外部依赖包： [Box2](https://www.npmjs.com/package/@galacean/effects-math)。',
        },
      ],
    },
    externalUrl: 'https://www.npmjs.com/package/@galacean/effects-math',
  });
  assert.equal(
    vectorType?.externalUrl,
    'https://www.npmjs.com/package/@galacean/effects-math',
  );
  assert.equal(Object.keys(externalized.symbolIdMap).includes('11'), false);
  assert.equal(Object.keys(externalized.symbolIdMap).includes('13'), false);
});

void test('requires API version configuration', async t => {
  const values = await fixture();
  let buildCalled = false;

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  await assert.rejects(
    generateAPIDocumentation(values.config, undefined, {
      ...values.dependencies,
      buildDeclarations: async () => {
        buildCalled = true;
      },
    }),
    /api generate requires api\.repository and api\.versions configuration/u,
  );
  assert.equal(buildCalled, false);
});

void test('builds the configured package version from the local workspace when versions match', async t => {
  const values = await fixture();
  const commit = 'c'.repeat(40);
  let buildCount = 0;

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  values.config.apiVersions = {
    repository: 'https://github.com/example/project.git',
    versions: ['1.2.3'],
  };

  const result = await generateAPIDocumentation(values.config, undefined, {
    ...values.dependencies,
    buildDeclarations: async () => {
      buildCount += 1;
    },
    getCommit: () => commit,
  });
  const manifest = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      path.join(values.apiDirectory, 'manifest.json'),
      'utf8',
    ),
  ) as {
    packages: {
      current: { packageVersion: string };
      versions: { version: string }[];
    }[];
  };

  assert.equal(buildCount, 1);
  assert.deepEqual(result.versionStatuses, [
    { version: '1.2.3', status: 'missing' },
  ]);
  assert.equal(manifest.packages[0]?.current.packageVersion, '1.2.3');
  assert.equal(manifest.packages[0]?.versions[0]?.version, '1.2.3');
  await assert.rejects(
    (await import('node:fs/promises')).readFile(
      path.join(values.apiDirectory, 'version-sources.json'),
    ),
    { code: 'ENOENT' },
  );
});

void test('requires fixed API versions through the mjs CLI', async t => {
  const values = await fixture();

  t.onTestFinished(() =>
    rm(values.repositoryRoot, { recursive: true, force: true }),
  );
  const siteDirectory = path.join(values.repositoryRoot, 'site');
  const configPath = path.join(siteDirectory, 'site.config.ts');
  const cliPath = path.resolve(import.meta.dirname, '../bin/galacean-docs.mjs');

  await mkdir(siteDirectory, { recursive: true });
  await writeFile(
    configPath,
    `export default ${JSON.stringify({
      sourceLocale: 'en',
      locales: ['en', 'zh-CN'],
      manual: { dataDirectory: 'site/public/data/manual' },
      api: {
        dataDirectory: 'site/public/data/api',
        packages: [
          {
            key: 'widget-dir',
            name: '@example/real-widget',
            directory: 'packages/widget-dir',
            tsconfig: 'tsconfig.json',
            entries: [
              {
                key: 'root',
                source: 'src/index.ts',
                types: 'dist/index.d.ts',
              },
            ],
          },
        ],
      },
      translationDirectory: 'tmp/docs-tools',
    })} as const;\n`,
  );

  let stderr = '';

  try {
    await execFileAsync(
      process.execPath,
      [cliPath, 'api', 'generate', '--config', 'site/site.config.ts'],
      { cwd: values.repositoryRoot },
    );
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'stderr' in error) {
      stderr = String(error.stderr);
    }
  }

  assert.match(
    stderr,
    /api generate requires api\.repository and api\.versions configuration/u,
  );
});
