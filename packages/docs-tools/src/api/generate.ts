import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Application, ReflectionKind } from 'typedoc';
import type { JSONOutput } from 'typedoc';
import ts from 'typescript';
import { assertNoSymlinkPath } from '../config/site-config';
import type { APIPackageConfig, DocsSiteConfig } from '../config/site-config';
import { readJSON } from './read-json';
import { assembleAPIDocumentation } from './assemble';
import type {
  APIDocumentationMetadata,
  APIDocumentationPackage,
} from './assemble';
import { contentHash } from './translations';
import { parseVersion } from './versions';

const typeKinds = new Set([
  'array',
  'conditional',
  'indexedAccess',
  'inferred',
  'intersection',
  'intrinsic',
  'literal',
  'mapped',
  'optional',
  'predicate',
  'query',
  'reference',
  'reflection',
  'rest',
  'templateLiteral',
  'tuple',
  'namedTupleMember',
  'typeOperator',
  'union',
  'unknown',
]);

export interface APIGenerationDependencies {
  buildDeclarations: (
    packages: APIPackageConfig[],
    repositoryRoot: string,
  ) => Promise<void>;
  convert: (
    config: DocsSiteConfig,
    commit: string,
  ) => Promise<JSONOutput.ProjectReflection>;
  getCommit: (repositoryRoot: string) => string;
  generatorVersion: () => Promise<string>;
}

function flattenedDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

function parsePackageConfig(filename: string): ts.ParsedCommandLine {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    filename,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: diagnostic => {
        throw new Error(flattenedDiagnostic(diagnostic));
      },
    },
  );

  if (parsed === undefined) {
    throw new Error(`Cannot read API tsconfig: ${filename}`);
  }
  const errors = parsed.errors.filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length > 0) {
    throw new Error(
      `Invalid API tsconfig ${filename}: ${errors.map(flattenedDiagnostic).join('\n')}`,
    );
  }

  return parsed;
}

export function collectPublicExports(
  packageConfig: APIPackageConfig,
): Map<string, string[]> {
  const parsed = parsePackageConfig(packageConfig.tsconfig);
  const program = ts.createProgram(
    [...parsed.fileNames, ...packageConfig.entries.map(entry => path.resolve(entry.types))],
    parsed.options,
  );
  const checker = program.getTypeChecker();

  return new Map(
    packageConfig.entries.map(entry => {
      const filename = path.resolve(entry.types);
      const sourceFile = program.getSourceFile(filename);
      const moduleSymbol =
        sourceFile === undefined
          ? undefined
          : checker.getSymbolAtLocation(sourceFile);

      if (moduleSymbol === undefined) {
        throw new Error(
          `Cannot resolve configured declaration entry: ${packageConfig.key}/${entry.types}`,
        );
      }
      const exports = checker
        .getExportsOfModule(moduleSymbol)
        .filter(symbol => {
          const target =
            symbol.flags & ts.SymbolFlags.Alias
              ? checker.getAliasedSymbol(symbol)
              : symbol;

          return !target
            .getJsDocTags(checker)
            .some(tag => tag.name === 'internal');
        })
        .map(symbol => symbol.name)
        .sort();

      return [entry.key, exports];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function valueArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function collectTypeDocReflections(
  project: JSONOutput.ProjectReflection,
  {
    allowExternalReferences = false,
  }: { allowExternalReferences?: boolean } = {},
): Map<number, JSONOutput.SomeReflection> {
  const reflections = new Map<number, JSONOutput.SomeReflection>();
  const references: JSONOutput.ReferenceType[] = [];

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);

      return;
    }
    if (!isRecord(value)) {
      return;
    }
    if (
      typeof value['id'] === 'number' &&
      typeof value['variant'] === 'string'
    ) {
      if (reflections.has(value['id'])) {
        throw new Error(`Duplicate TypeDoc reflection ID: ${value['id']}`);
      }
      reflections.set(
        value['id'],
        value as unknown as JSONOutput.SomeReflection,
      );
    }
    if (typeof value['type'] === 'string') {
      if (!typeKinds.has(value['type'])) {
        throw new Error(`Unsupported TypeDoc type: ${value['type']}`);
      }
      if (
        value['type'] === 'reference' &&
        typeof value['target'] === 'number' &&
        value['target'] >= 0
      ) {
        references.push(value as unknown as JSONOutput.ReferenceType);
      }
    }
    Object.values(value).forEach(visit);
  }

  visit(project);
  for (const reference of references) {
    if (
      !allowExternalReferences &&
      !reflections.has(reference.target as number)
    ) {
      throw new Error(
        `Unresolved TypeDoc reference ${reference.name}: ${String(reference.target)}`,
      );
    }
  }

  return reflections;
}

function resolveReflection(
  reflection: JSONOutput.SomeReflection,
  reflections: Map<number, JSONOutput.SomeReflection>,
  visited = new Set<number>(),
): JSONOutput.SomeReflection {
  if (reflection.variant === 'declaration') {
    return reflection;
  }
  const reference = reflection as JSONOutput.ReferenceReflection;

  if (visited.has(reference.id)) {
    throw new Error(`Cyclic public TypeDoc alias: ${reference.name}`);
  }
  visited.add(reference.id);
  const target = reflections.get(reference.target);

  if (target === undefined) {
    throw new Error(`Unresolved public TypeDoc alias: ${reference.name}`);
  }

  return resolveReflection(target, reflections, visited);
}

export function buildAPIDocumentationPackages(
  config: DocsSiteConfig,
  manifests: Map<string, { name: string; version: string }>,
  project: JSONOutput.ProjectReflection,
): APIDocumentationPackage[] {
  if (config.apiPackages === undefined || config.apiPackages.length === 0) {
    throw new Error(
      'site config must declare api.packages before API generation',
    );
  }
  const reflections = collectTypeDocReflections(project);

  function findExportedReflection(
    module: JSONOutput.DeclarationReflection,
    name: string,
  ): JSONOutput.SomeReflection | undefined {
    const candidates = module.children?.flatMap(child =>
      child.kind === ReflectionKind.Module ? child.children ?? [] : [child],
    ) ?? [];

    return candidates.find(child => child.name === name);
  }

  return config.apiPackages.map(packageConfig => {
    const manifest = manifests.get(packageConfig.key);

    if (manifest === undefined || manifest.name !== packageConfig.name) {
      throw new Error(
        `Package manifest does not match configured API package: ${packageConfig.key}`,
      );
    }
    parseVersion(manifest.version);
    const exportsByEntry = collectPublicExports(packageConfig);
    const module = project.children?.find(
      child =>
        child.name === packageConfig.name &&
        child.kind === ReflectionKind.Module,
    );

    if (module === undefined || module.variant !== 'declaration') {
      const availableModules =
        project.children?.map(child => child.name).join(', ') ?? '';

      throw new Error(
        `Missing TypeDoc package module: ${packageConfig.name}; available: ${availableModules}`,
      );
    }
    const entries = packageConfig.entries.map(entry => {
      const exports = exportsByEntry.get(entry.key);

      if (exports === undefined) {
        throw new Error(
          `Missing public export list for ${packageConfig.key}/${entry.key}`,
        );
      }
      const symbols = exports.map(name => {
        const exported = findExportedReflection(module, name);

        if (exported === undefined) {
          throw new Error(
            `Filtered public TypeScript export: ${packageConfig.name}/${entry.key} -> ${name}`,
          );
        }
        const target = resolveReflection(exported, reflections);

        return { name, id: target.id, kind: target.kind };
      });
      const source = path
        .relative(packageConfig.directory, entry.source)
        .split(path.sep)
        .join('/');
      const types = path
        .relative(packageConfig.directory, entry.types)
        .split(path.sep)
        .join('/');

      return { key: entry.key, source, types, id: module.id, symbols };
    });

    return {
      key: packageConfig.key,
      name: manifest.name,
      version: manifest.version,
      entries,
    };
  });
}

async function buildDeclarations(
  packages: APIPackageConfig[],
  repositoryRoot: string,
): Promise<void> {
  const typeScriptEntry = fileURLToPath(import.meta.resolve('typescript'));
  const compilerPath = path.resolve(
    path.dirname(typeScriptEntry),
    '../bin/tsc',
  );

  execFileSync(
    process.execPath,
    [
      '--',
      compilerPath,
      '--build',
      ...packages.map(pkg => pkg.tsconfig),
      '--emitDeclarationOnly',
    ],
    { cwd: repositoryRoot, stdio: 'inherit' },
  );
  for (const pkg of packages) {
    for (const entry of pkg.entries) {
      await readFile(entry.types);
    }
  }
}

interface RemappedTypeDocProject {
  project: Record<string, unknown>;
  files: Record<string, unknown>;
  symbolIdMap: Record<string, unknown>;
}

function remapTypeDocProject(
  project: JSONOutput.ProjectReflection,
  firstId: number,
): { result: RemappedTypeDocProject; nextId: number } {
  const reflections = collectTypeDocReflections(project, {
    allowExternalReferences: true,
  });
  const ids = [...reflections.keys()];
  const idMap = new Map(ids.map((id, index) => [id, firstId + index]));
  const originalSymbols: Record<string, JSONOutput.ReflectionSymbolId> =
    isRecord(project['symbolIdMap']) ? project['symbolIdMap'] : {};
  const remappedSymbols: Record<string, JSONOutput.ReflectionSymbolId> = {};

  for (const [oldId, symbol] of Object.entries(originalSymbols)) {
    const mappedId = idMap.get(Number(oldId));

    if (mappedId !== undefined) {
      remappedSymbols[String(mappedId)] = symbol;
    }
  }

  function remap(value: unknown, key = ''): unknown {
    if (Array.isArray(value)) {
      if (key === 'children' && value.every(item => typeof item === 'number')) {
        return value.map(item =>
          typeof item === 'number' ? (idMap.get(item) ?? item) : item,
        );
      }

      return value.map(item => remap(item));
    }
    if (!isRecord(value)) {
      return value;
    }
    const output: Record<string, unknown> = {};
    const isReflection =
      typeof value['id'] === 'number' && typeof value['variant'] === 'string';

    for (const [property, child] of Object.entries(value)) {
      if (property === 'files' || property === 'symbolIdMap') {
        continue;
      }
      if (property === 'id' && isReflection && typeof child === 'number') {
        output[property] = idMap.get(child) ?? child;
      } else if (property === 'target' && typeof child === 'number') {
        const mappedTarget = idMap.get(child);
        const externalSymbol = originalSymbols[String(child)];

        output[property] =
          mappedTarget ??
          (value['type'] === 'reference' && externalSymbol !== undefined
            ? externalSymbol
            : child < 0
              ? child
              : -child - 1);
      } else {
        output[property] = remap(child, property);
      }
    }

    return output;
  }

  const rawProject = remap(project) as Record<string, unknown>;
  const sourceFiles: Record<string, unknown> = isRecord(project['files'])
    ? project['files']
    : {};
  const sourceFileRefs = isRecord(sourceFiles['reflections'])
    ? sourceFiles['reflections']
    : {};
  const sourceFileEntries = isRecord(sourceFiles['entries'])
    ? sourceFiles['entries']
    : {};
  const files = {
    entries: sourceFileEntries,
    reflections: Object.fromEntries(
      Object.entries(sourceFileRefs).map(([index, id]) => [
        index,
        typeof id === 'number' ? (idMap.get(id) ?? id) : id,
      ]),
    ),
  };

  return {
    result: { project: rawProject, files, symbolIdMap: remappedSymbols },
    nextId: firstId + ids.length,
  };
}

function ensurePackageModules(
  project: JSONOutput.ProjectReflection,
  packages: APIPackageConfig[],
): JSONOutput.ProjectReflection {
  const names = new Set(packages.map(pkg => pkg.name));
  const modules = (project.children ?? []).filter(
    child => child.kind === ReflectionKind.Module && names.has(child.name),
  );

  if (modules.length === packages.length) {
    return project;
  }

  if (packages.length !== 1 || modules.length !== 0) {
    throw new Error(
      `TypeDoc package conversion did not create one module per package: ${packages.map(pkg => pkg.name).join(', ')}`,
    );
  }
  const pkg = packages[0];

  if (pkg === undefined) {
    throw new Error('Cannot wrap an empty TypeDoc package group');
  }
  const reflections = collectTypeDocReflections(project, {
    allowExternalReferences: true,
  });
  const id = Math.max(-1, ...reflections.keys()) + 1;
  const module = {
    id,
    name: pkg.name,
    kind: ReflectionKind.Module,
    variant: 'declaration' as const,
    flags: {},
    children: project.children ?? [],
  };

  return {
    ...project,
    children: [module as unknown as JSONOutput.DeclarationReflection],
  };
}

function mergeTypeDocProjects(
  projects: JSONOutput.ProjectReflection[],
): JSONOutput.ProjectReflection {
  if (projects.length === 0) {
    throw new Error('TypeDoc produced no package groups');
  }
  const transformed: RemappedTypeDocProject[] = [];
  let nextId = 1;

  for (const project of projects) {
    const result = remapTypeDocProject(project, nextId);

    transformed.push(result.result);
    nextId = result.nextId;
  }
  const entries: Record<string, string> = {};
  const fileIndexes = new Map<string, number>();
  const fileReflections: Record<string, number> = {};

  for (const group of transformed) {
    const groupEntries = group.files['entries'];
    const groupRefs = group.files['reflections'];

    if (!isRecord(groupEntries) || !isRecord(groupRefs)) {
      continue;
    }
    const indexMap = new Map<number, number>();

    for (const [index, filename] of Object.entries(groupEntries)) {
      if (typeof filename !== 'string') {
        continue;
      }
      const sourceIndex = Number(index);

      if (!Number.isInteger(sourceIndex)) {
        throw new Error(`Invalid TypeDoc file index: ${index}`);
      }
      let targetIndex = fileIndexes.get(filename);

      if (targetIndex === undefined) {
        targetIndex = fileIndexes.size;
        entries[String(targetIndex)] = filename;
        fileIndexes.set(filename, targetIndex);
      }
      indexMap.set(sourceIndex, targetIndex);
    }
    for (const [index, reflectionId] of Object.entries(groupRefs)) {
      const targetIndex = indexMap.get(Number(index));

      if (targetIndex !== undefined && typeof reflectionId === 'number') {
        fileReflections[String(targetIndex)] = reflectionId;
      }
    }
  }
  const first = transformed[0]?.project;

  if (first === undefined) {
    throw new Error('TypeDoc project merge lost its base project');
  }
  const children = transformed.flatMap(group =>
    valueArray(group.project['children']),
  );
  const groups = transformed.flatMap(group =>
    valueArray(group.project['groups']),
  );
  const categories = transformed.flatMap(group =>
    valueArray(group.project['categories']),
  );
  const symbolIdMap: Record<string, unknown> = {};

  for (const group of transformed) {
    for (const [id, symbol] of Object.entries(group.symbolIdMap)) {
      symbolIdMap[id] = symbol;
    }
  }
  const root = {
    ...first,
    id: nextId,
    children,
    groups,
    categories,
    symbolIdMap,
    files: { entries, reflections: fileReflections },
  };

  return root as unknown as JSONOutput.ProjectReflection;
}

async function convertTypeDoc(
  config: DocsSiteConfig,
  commit: string,
): Promise<JSONOutput.ProjectReflection> {
  const sourceLinkTemplate = config.sourceLinkTemplate?.replaceAll(
    '{commit}',
    commit,
  );
  const packages = config.apiPackages;

  if (packages === undefined || packages.length === 0) {
    throw new Error(
      'site config must declare api.packages before TypeDoc conversion',
    );
  }
  const projects: JSONOutput.ProjectReflection[] = [];

  for (const packageConfig of packages) {
    const entryPoints = packageConfig.entries.map(entry => entry.source);

    if (entryPoints.length === 0) {
      throw new Error('TypeDoc package entries cannot be empty');
    }
    const options = {
      excludeReferences: false,
      excludeNotDocumented: false,
      excludeInternal: true,
      excludeExternals: true,
      ...config.typedocOptions,
      name: packageConfig.name,
      entryPoints,
      entryPointStrategy: 'resolve',
      tsconfig: packageConfig.tsconfig,
      readme: 'none',
      basePath: config.repositoryRoot,
      gitRevision: commit,
      disableGit: true,
      ...(sourceLinkTemplate === undefined ? {} : { sourceLinkTemplate }),
    } satisfies Parameters<typeof Application.bootstrapWithPlugins>[0];
    const application = await Application.bootstrapWithPlugins(options);
    const project = await application.convert();

    if (project === undefined || application.logger.hasErrors()) {
      throw new Error('TypeDoc conversion failed');
    }
    projects.push(
      ensurePackageModules(
        application.serializer.projectToObject(
          project,
          application.options.getValue('basePath'),
        ),
        [packageConfig],
      ),
    );
  }

  return mergeTypeDocProjects(projects);
}

async function typeDocVersion(): Promise<string> {
  const typeDocEntry = fileURLToPath(import.meta.resolve('typedoc'));
  const packagePath = path.resolve(
    path.dirname(typeDocEntry),
    '../package.json',
  );
  const manifest = await readJSON(packagePath);

  if (!isRecord(manifest) || typeof manifest['version'] !== 'string') {
    throw new Error('Cannot read TypeDoc package version');
  }

  return manifest['version'];
}

const defaultDependencies: APIGenerationDependencies = {
  buildDeclarations,
  convert: convertTypeDoc,
  getCommit: repositoryRoot =>
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
  generatorVersion: typeDocVersion,
};

export async function generateAPIDocumentation(
  config: DocsSiteConfig,
  selectedPackageKeys?: string[],
  dependencies: APIGenerationDependencies = defaultDependencies,
): Promise<{ packages: number; exports: number; warnings: string[] }> {
  const packages = config.apiPackages;

  if (packages === undefined || packages.length === 0) {
    throw new Error(
      'site config must declare api.packages before API generation',
    );
  }
  const selectedKeys = selectedPackageKeys ?? packages.map(pkg => pkg.key);
  const selectedSet = new Set(selectedKeys);

  if (
    selectedSet.size !== selectedKeys.length ||
    selectedKeys.some(key => !packages.some(pkg => pkg.key === key))
  ) {
    throw new Error(
      'API generation selected unknown or duplicate package keys',
    );
  }
  const packageManifests = new Map<string, { name: string; version: string }>();

  for (const pkg of packages) {
    await assertNoSymlinkPath(config.repositoryRoot, pkg.directory);
    await assertNoSymlinkPath(config.repositoryRoot, pkg.tsconfig);
    const manifestPath = path.join(pkg.directory, 'package.json');
    const manifest = await readJSON(manifestPath);

    if (
      !isRecord(manifest) ||
      typeof manifest['name'] !== 'string' ||
      typeof manifest['version'] !== 'string' ||
      manifest['name'] !== pkg.name
    ) {
      throw new Error(
        `Package manifest does not match configured API package: ${pkg.key}`,
      );
    }
    parseVersion(manifest['version']);
    packageManifests.set(pkg.key, {
      name: manifest['name'],
      version: manifest['version'],
    });
    for (const entry of pkg.entries) {
      await assertNoSymlinkPath(config.repositoryRoot, entry.source);
      await assertNoSymlinkPath(config.repositoryRoot, entry.types);
    }
  }
  await dependencies.buildDeclarations(packages, config.repositoryRoot);
  const commit = dependencies.getCommit(config.repositoryRoot);
  const project = await dependencies.convert(config, commit);
  const generatedPackages = buildAPIDocumentationPackages(
    config,
    packageManifests,
    project,
  );
  const metadata: APIDocumentationMetadata = {
    commit,
    generatorVersion: await dependencies.generatorVersion(),
    sourceHash: contentHash(project),
    packages: generatedPackages,
  };

  return assembleAPIDocumentation(
    metadataProject(project),
    metadata,
    config,
    selectedKeys,
  );
}

function metadataProject(
  project: JSONOutput.ProjectReflection,
): Record<string, unknown> {
  return project as unknown as Record<string, unknown>;
}
