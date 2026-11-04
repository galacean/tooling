export interface DocumentationPackage {
  key: string;
  name: string;
  version?: string;
  entries: {
    key: string;
    symbols: { name: string; id: number; kind: number }[];
  }[];
}

export interface ReflectionLocation {
  pkg: string;
  entry: string;
  symbol: string;
  hash: string;
}

export interface ReflectionIndex<TReflection extends object> {
  byId: Map<number, TReflection>;
  parents: Map<number, number>;
  locations: Map<number, ReflectionLocation>;
  resolve: (target: unknown) => TReflection | undefined;
  url: (locale: string, version: string, id: number) => string | undefined;
}

interface ReflectionRecord {
  id: number;
  name: string;
  variant: string;
  [key: string]: unknown;
}

type DataRecord = Record<string, unknown>;

function isDataRecord(value: unknown): value is DataRecord {
  return value !== null && typeof value === 'object';
}

function isReflectionRecord(value: unknown): value is ReflectionRecord {
  return (
    isDataRecord(value) &&
    typeof value['id'] === 'number' &&
    typeof value['name'] === 'string' &&
    typeof value['variant'] === 'string'
  );
}

function reflectionRecords(value: unknown): ReflectionRecord[] {
  return Array.isArray(value) ? value.filter(isReflectionRecord) : [];
}

export interface DeclarationReflectionLike {
  variant: 'declaration' | 'reference';
  extendedTypes?: unknown[];
  implementedTypes?: unknown[];
  type?: unknown;
}

export function childrenOf<TReflection extends object>(
  reflection: TReflection,
): (TReflection & DeclarationReflectionLike)[] {
  const record: DataRecord = isDataRecord(reflection) ? reflection : {};
  const children = reflectionRecords(record['children']);

  return children.filter(isDeclaration) as unknown as (TReflection &
    DeclarationReflectionLike)[];
}

export function signaturesOf<TSignature extends object = object>(
  reflection: object,
): TSignature[] {
  const record: DataRecord = isDataRecord(reflection) ? reflection : {};
  const signatures = [
    ...reflectionRecords(record['signatures']),
    ...reflectionRecords(record['indexSignatures']),
    ...reflectionRecords(
      record['getSignature'] === undefined ? [] : [record['getSignature']],
    ),
    ...reflectionRecords(
      record['setSignature'] === undefined ? [] : [record['setSignature']],
    ),
  ];

  return signatures as TSignature[];
}

export function isDeclaration<TReflection extends object>(
  reflection: TReflection,
): reflection is TReflection & DeclarationReflectionLike {
  const record: DataRecord = isDataRecord(reflection) ? reflection : {};

  return (
    record['variant'] === 'declaration' || record['variant'] === 'reference'
  );
}

export function buildReflectionIndex<TReflection extends object>(
  project: object,
  packages: DocumentationPackage[],
  getSymbolURL: (
    locale: string,
    packageKey: string,
    version: string,
    symbol: string,
    entry: string,
    hash: string,
  ) => string,
): ReflectionIndex<TReflection> {
  if (!isReflectionRecord(project)) {
    throw new Error('Invalid TypeDoc project reflection');
  }
  const root = project;
  const byId = new Map<number, ReflectionRecord>();
  const parents = new Map<number, number>();
  const children = new Map<number, number[]>();
  const locations = new Map<number, ReflectionLocation>();

  function isType(value: unknown): value is DataRecord {
    return isDataRecord(value) && typeof value['type'] === 'string';
  }

  function visitType(type: DataRecord, parent: number) {
    if (type['type'] === 'reflection') {
      const declaration = type['declaration'];

      if (isReflectionRecord(declaration)) {
        visit(declaration, parent);
      }
    }
    for (const value of Object.values(type)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (Array.isArray(item)) {
            item.forEach(part => {
              if (isType(part)) {
                visitType(part, parent);
              }
            });
          } else if (isType(item)) {
            visitType(item, parent);
          }
        }
      } else if (isType(value)) {
        visitType(value, parent);
      }
    }
  }

  function visit(reflection: ReflectionRecord, parent?: number) {
    byId.set(reflection.id, reflection);
    if (parent !== undefined) {
      parents.set(reflection.id, parent);
      const siblings = children.get(parent) ?? [];

      siblings.push(reflection.id);
      children.set(parent, siblings);
    }
    childrenOf(reflection).forEach(child => visit(child, reflection.id));
    signaturesOf<ReflectionRecord>(reflection).forEach(signature =>
      visit(signature, reflection.id),
    );
    reflectionRecords(reflection['parameters']).forEach(parameter =>
      visit(parameter, reflection.id),
    );
    reflectionRecords(reflection['typeParameters']).forEach(parameter =>
      visit(parameter, reflection.id),
    );
    if (isType(reflection['type'])) {
      visitType(reflection['type'], reflection.id);
    }
    if (isType(reflection['default'])) {
      visitType(reflection['default'], reflection.id);
    }
  }

  visit(root);
  for (const pkg of packages) {
    for (const entry of pkg.entries) {
      for (const symbol of entry.symbols) {
        const locate = (id: number, hash: string) => {
          if (!locations.has(id)) {
            locations.set(id, {
              pkg: pkg.key,
              entry: entry.key,
              symbol: symbol.name,
              hash,
            });
          }
          for (const childId of children.get(id) ?? []) {
            const child = byId.get(childId);

            const childVariant = child?.['variant'];
            const childName = child?.['name'];

            locate(
              childId,
              childVariant === 'typeParam' && typeof childName === 'string'
                ? `${symbol.name}.${childName}`
                : childVariant === 'declaration' &&
                    typeof childName === 'string'
                  ? [hash, childName].filter(part => part !== '').join('.')
                  : hash,
            );
          }
        };

        locate(symbol.id, '');
      }
    }
  }
  const resolve = (target: unknown): TReflection | undefined => {
    if (typeof target === 'number') {
      let reflection = byId.get(target);
      const visited = new Set<number>();

      while (reflection?.['variant'] === 'reference') {
        if (visited.has(reflection.id)) {
          return undefined;
        }
        visited.add(reflection.id);
        const referenceTarget = reflection['target'];

        reflection =
          typeof referenceTarget === 'number'
            ? byId.get(referenceTarget)
            : undefined;
      }

      return reflection as TReflection | undefined;
    }
    if (target !== null && typeof target === 'object') {
      const symbol = target as DataRecord;
      const symbolIdMap = isDataRecord(root['symbolIdMap'])
        ? root['symbolIdMap']
        : {};
      const matches = Object.entries(symbolIdMap).find(([, value]) => {
        if (!isDataRecord(value)) {
          return false;
        }

        return (
          value['packageName'] === symbol['packageName'] &&
          value['packagePath'] === symbol['packagePath'] &&
          value['qualifiedName'] === symbol['qualifiedName']
        );
      });

      return (
        matches === undefined ? undefined : byId.get(Number(matches[0]))
      ) as TReflection | undefined;
    }

    return undefined;
  };
  const url = (
    locale: string,
    version: string,
    id: number,
  ): string | undefined => {
    const location = locations.get(id);
    const packageVersion =
      packages.find(pkg => pkg.key === location?.pkg)?.version ?? version;

    return location === undefined
      ? undefined
      : getSymbolURL(
          locale,
          location.pkg,
          packageVersion,
          location.symbol,
          location.entry,
          location.hash,
        );
  };

  return {
    byId: byId as Map<number, TReflection>,
    parents,
    locations,
    resolve,
    url,
  };
}

export function isExternalInherited<TReflection extends object>(
  reflection: TReflection,
  index: ReflectionIndex<TReflection>,
): boolean {
  const record: DataRecord = isDataRecord(reflection) ? reflection : {};
  const inheritedFrom = record['inheritedFrom'];

  return (
    isDataRecord(inheritedFrom) &&
    index.resolve(inheritedFrom['target']) === undefined
  );
}
