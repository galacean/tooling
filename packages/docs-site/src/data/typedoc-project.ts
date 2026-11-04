const commentPartKinds = new Set([
  'text',
  'code',
  'inline-tag',
  'relative-link',
]);
const reflectionVariants = new Set([
  'project',
  'declaration',
  'reference',
  'signature',
  'param',
  'typeParam',
  'document',
]);
const typeFields = {
  array: ['elementType'],
  conditional: ['checkType', 'extendsType', 'trueType', 'falseType'],
  indexedAccess: ['objectType', 'indexType'],
  inferred: [],
  intersection: [],
  intrinsic: [],
  literal: [],
  mapped: ['parameterType', 'templateType'],
  optional: ['elementType'],
  predicate: [],
  query: ['queryType'],
  reference: [],
  reflection: [],
  rest: ['elementType'],
  templateLiteral: [],
  tuple: [],
  namedTupleMember: ['element'],
  typeOperator: ['target'],
  union: [],
  unknown: [],
} as const;

type LocaleValidator = (value: unknown) => boolean;
type JSONRecord = Record<string, unknown> &
  Partial<
    Record<
      | 'blockTags'
      | 'category'
      | 'checkType'
      | 'children'
      | 'comment'
      | 'constraint'
      | 'content'
      | 'declaration'
      | 'default'
      | 'element'
      | 'elementType'
      | 'elements'
      | 'entries'
      | 'extendsType'
      | 'extendedTypes'
      | 'falseType'
      | 'fileName'
      | 'files'
      | 'flags'
      | 'getSignature'
      | 'head'
      | 'id'
      | 'implementedTypes'
      | 'implementationOf'
      | 'indexSignatures'
      | 'indexType'
      | 'inheritedFrom'
      | 'kind'
      | 'keywords'
      | 'line'
      | 'name'
      | 'nameType'
      | 'negative'
      | 'objectType'
      | 'operator'
      | 'overwrites'
      | 'packageName'
      | 'packagePath'
      | 'parameter'
      | 'parameterType'
      | 'parameters'
      | 'pkg'
      | 'queryType'
      | 'qualifiedName'
      | 'reflections'
      | 'schemaVersion'
      | 'setSignature'
      | 'signatures'
      | 'sourceLocale'
      | 'sources'
      | 'summary'
      | 'symbolIdMap'
      | 'tag'
      | 'tail'
      | 'target'
      | 'targetType'
      | 'templateType'
      | 'text'
      | 'trueType'
      | 'type'
      | 'typeArguments'
      | 'typeParameters'
      | 'types'
      | 'url'
      | 'value'
      | 'variant'
      | 'version',
      unknown
    >
  >;

export function isRecord(value: unknown): value is JSONRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkParts(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      part =>
        isRecord(part) &&
        typeof part.text === 'string' &&
        commentPartKinds.has(String(part.kind)),
    )
  );
}

function checkReflection(value: unknown, isLocale: LocaleValidator): boolean {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.name !== 'string' ||
    typeof value.kind !== 'number' ||
    !isRecord(value.flags) ||
    !reflectionVariants.has(String(value.variant))
  ) {
    return false;
  }
  if (
    value.comment !== undefined &&
    (!isRecord(value.comment) ||
      !checkParts(value.comment.summary) ||
      (value.comment.sourceLocale !== undefined &&
        !isLocale(value.comment.sourceLocale)) ||
      (value.comment.blockTags !== undefined &&
        (!Array.isArray(value.comment.blockTags) ||
          !value.comment.blockTags.every(
            tag =>
              isRecord(tag) &&
              typeof tag.tag === 'string' &&
              (tag.sourceLocale === undefined || isLocale(tag.sourceLocale)) &&
              checkParts(tag.content),
          ))))
  ) {
    return false;
  }
  for (const key of [
    'children',
    'signatures',
    'parameters',
    'typeParameters',
    'indexSignatures',
  ]) {
    if (
      value[key] !== undefined &&
      (!Array.isArray(value[key]) ||
        !value[key].every(reflection => checkReflection(reflection, isLocale)))
    ) {
      return false;
    }
  }
  for (const key of ['getSignature', 'setSignature']) {
    if (value[key] !== undefined && !checkReflection(value[key], isLocale)) {
      return false;
    }
  }
  for (const key of [
    'type',
    'default',
    'inheritedFrom',
    'overwrites',
    'implementationOf',
  ]) {
    if (value[key] !== undefined && !checkType(value[key], isLocale)) {
      return false;
    }
  }
  for (const key of ['extendedTypes', 'implementedTypes']) {
    if (
      value[key] !== undefined &&
      (!Array.isArray(value[key]) ||
        !value[key].every(type => checkType(type, isLocale)))
    ) {
      return false;
    }
  }
  if (value.variant === 'reference' && !Number.isInteger(value.target)) {
    return false;
  }
  if (
    value.sources !== undefined &&
    (!Array.isArray(value.sources) ||
      !value.sources.every(
        source =>
          isRecord(source) &&
          typeof source.fileName === 'string' &&
          typeof source.line === 'number' &&
          (source.url === undefined || typeof source.url === 'string'),
      ))
  ) {
    return false;
  }

  return true;
}

function checkType(value: unknown, isLocale: LocaleValidator): boolean {
  if (
    !isRecord(value) ||
    typeof value.type !== 'string' ||
    !Object.hasOwn(typeFields, value.type) ||
    !typeFields[value.type as keyof typeof typeFields].every(key =>
      checkType(value[key], isLocale),
    )
  ) {
    return false;
  }
  if (
    [
      'intrinsic',
      'unknown',
      'reference',
      'inferred',
      'predicate',
      'namedTupleMember',
    ].includes(value.type) &&
    typeof value.name !== 'string'
  ) {
    return false;
  }
  if (
    value.type === 'reference' &&
    typeof value.target !== 'number' &&
    !isRecord(value.target)
  ) {
    return false;
  }
  if (
    value.type === 'reference' &&
    isRecord(value.target) &&
    (typeof value.target.packageName !== 'string' ||
      typeof value.target.packagePath !== 'string' ||
      typeof value.target.qualifiedName !== 'string')
  ) {
    return false;
  }
  if (
    ['union', 'intersection'].includes(value.type) &&
    !Array.isArray(value.types)
  ) {
    return false;
  }
  if (value.type === 'mapped' && typeof value.parameter !== 'string') {
    return false;
  }
  if (
    value.type === 'typeOperator' &&
    !['keyof', 'unique', 'readonly'].includes(String(value.operator))
  ) {
    return false;
  }
  if (
    value.type === 'literal' &&
    !(
      value.value === null ||
      ['string', 'number', 'boolean'].includes(typeof value.value) ||
      (isRecord(value.value) &&
        typeof value.value.value === 'string' &&
        typeof value.value.negative === 'boolean')
    )
  ) {
    return false;
  }
  if (
    value.type === 'reflection' &&
    !checkReflection(value.declaration, isLocale)
  ) {
    return false;
  }
  for (const key of ['types', 'elements', 'typeArguments']) {
    if (
      value[key] !== undefined &&
      (!Array.isArray(value[key]) ||
        !value[key].every(type => checkType(type, isLocale)))
    ) {
      return false;
    }
  }
  for (const key of ['constraint', 'nameType', 'targetType']) {
    if (value[key] !== undefined && !checkType(value[key], isLocale)) {
      return false;
    }
  }
  if (
    value.type === 'templateLiteral' &&
    (typeof value.head !== 'string' ||
      !Array.isArray(value.tail) ||
      !value.tail.every(
        item =>
          Array.isArray(item) &&
          checkType(item[0], isLocale) &&
          typeof item[1] === 'string',
      ))
  ) {
    return false;
  }

  return true;
}

function isProject(value: unknown, isLocale: LocaleValidator): boolean {
  return (
    isRecord(value) &&
    value.variant === 'project' &&
    value.schemaVersion === '2.0' &&
    isRecord(value.symbolIdMap) &&
    Object.values(value.symbolIdMap).every(
      symbol =>
        isRecord(symbol) &&
        typeof symbol.packageName === 'string' &&
        typeof symbol.packagePath === 'string' &&
        typeof symbol.qualifiedName === 'string',
    ) &&
    isRecord(value.files) &&
    isRecord(value.files.entries) &&
    isRecord(value.files.reflections) &&
    Object.values(value.files.entries).every(
      file => typeof file === 'string',
    ) &&
    Object.values(value.files.reflections).every(
      id => typeof id === 'number',
    ) &&
    checkReflection(value, isLocale)
  );
}

export function parseProject<T>(
  value: unknown,
  isLocale: LocaleValidator = locale => typeof locale === 'string',
): T {
  if (!isProject(value, isLocale)) {
    throw new Error('Invalid TypeDoc reflection JSON (expected schema 2.0)');
  }

  return value as T;
}
