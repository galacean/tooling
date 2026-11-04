import type { JSONOutput } from 'typedoc';

export interface TypeToken {
  text: string;
  role:
    | 'symbol'
    | 'name'
    | 'primitive'
    | 'literal'
    | 'type'
    | 'keyword'
    | 'generic';
  reference?: unknown;
}

const token = (
  text: string,
  role: TypeToken['role'] = 'symbol',
): TypeToken[] => [{ text, role }];
const join = (items: TypeToken[][], separator: string): TypeToken[] =>
  items.flatMap((item, index) => [
    ...(index === 0 ? [] : token(separator)),
    ...item,
  ]);

export function formatGenerics(
  parameters: readonly unknown[] = [],
): TypeToken[] {
  return formatTypedGenerics(
    parameters as JSONOutput.TypeParameterReflection[],
  );
}

function formatTypedGenerics(
  parameters: JSONOutput.TypeParameterReflection[],
): TypeToken[] {
  if (parameters.length === 0) {
    return [];
  }

  return [
    ...token('<'),
    ...join(
      parameters.map(parameter => [
        ...token(parameter.name, 'generic'),
        ...(parameter.type === undefined
          ? []
          : [...token(' extends ', 'keyword'), ...formatType(parameter.type)]),
        ...(parameter.default === undefined
          ? []
          : [...token(' = '), ...formatType(parameter.default)]),
      ]),
      ', ',
    ),
    ...token('>'),
  ];
}

export function formatSignature(
  signature: unknown,
  arrow = false,
): TypeToken[] {
  return formatTypedSignature(
    signature as JSONOutput.SignatureReflection,
    arrow,
  );
}

function formatTypedSignature(
  signature: JSONOutput.SignatureReflection,
  arrow: boolean,
): TypeToken[] {
  return [
    ...(arrow ? [] : token(signature.name, 'name')),
    ...formatGenerics(signature.typeParameters),
    ...token('('),
    ...join(
      (signature.parameters ?? []).map(parameter => [
        ...(parameter.flags.isRest === true ? token('...') : []),
        ...token(parameter.name, 'name'),
        ...token(parameter.flags.isOptional === true ? '?: ' : ': '),
        ...formatType(parameter.type),
        ...(parameter.defaultValue === undefined
          ? []
          : token(` = ${parameter.defaultValue}`, 'literal')),
      ]),
      ', ',
    ),
    ...token(arrow ? ') => ' : '): '),
    ...formatType(signature.type),
  ];
}

export function formatType(type: unknown, depth = 0): TypeToken[] {
  return formatTypedType(type as JSONOutput.SomeType | undefined, depth);
}

function formatTypedType(
  type: JSONOutput.SomeType | undefined,
  depth: number,
): TypeToken[] {
  if (type === undefined) {
    return token('unknown', 'primitive');
  }
  if (depth > 40) {
    throw new Error('Type nesting exceeds 40 levels');
  }
  const next = (item: JSONOutput.SomeType | undefined) =>
    formatType(item, depth + 1);

  switch (type.type) {
    case 'unknown':
    case 'intrinsic':
      return token(type.name, 'primitive');
    case 'reference':
      return [
        {
          text: type.name,
          role: type.refersToTypeParameter === true ? 'generic' : 'type',
          reference: type,
        },
        ...(type.typeArguments === undefined || type.typeArguments.length === 0
          ? []
          : [
              ...token('<'),
              ...join(type.typeArguments.map(next), ', '),
              ...token('>'),
            ]),
      ];
    case 'literal':
      return token(
        typeof type.value === 'object' && type.value !== null
          ? `${type.value.negative ? '-' : ''}${type.value.value}n`
          : JSON.stringify(type.value),
        'literal',
      );
    case 'array':
      return [
        'union',
        'intersection',
        'conditional',
        'reflection',
        'typeOperator',
      ].includes(type.elementType.type)
        ? [...token('('), ...next(type.elementType), ...token(')[]')]
        : [...next(type.elementType), ...token('[]')];
    case 'union':
    case 'intersection':
      return join(
        type.types.map(next),
        type.types.length > 3
          ? `\n${'  '.repeat(depth + 1)}${type.type === 'union' ? '| ' : '& '}`
          : type.type === 'union'
            ? ' | '
            : ' & ',
      );
    case 'tuple':
      return [
        ...token('['),
        ...join((type.elements ?? []).map(next), ', '),
        ...token(']'),
      ];
    case 'namedTupleMember':
      return [
        ...token(type.name, 'name'),
        ...token(type.isOptional ? '?: ' : ': '),
        ...next(type.element),
      ];
    case 'typeOperator':
      return [...token(`${type.operator} `, 'keyword'), ...next(type.target)];
    case 'indexedAccess':
      return [
        ...next(type.objectType),
        ...token('['),
        ...next(type.indexType),
        ...token(']'),
      ];
    case 'query':
      return [...token('typeof ', 'keyword'), ...next(type.queryType)];
    case 'predicate':
      return [
        ...(type.asserts ? token('asserts ', 'keyword') : []),
        ...token(type.name, 'name'),
        ...(type.targetType === undefined
          ? []
          : [...token(' is ', 'keyword'), ...next(type.targetType)]),
      ];
    case 'conditional':
      return [
        ...next(type.checkType),
        ...token(' extends ', 'keyword'),
        ...next(type.extendsType),
        ...token(' ? '),
        ...next(type.trueType),
        ...token(' : '),
        ...next(type.falseType),
      ];
    case 'inferred':
      return [
        ...token('infer ', 'keyword'),
        ...token(type.name, 'generic'),
        ...(type.constraint === undefined
          ? []
          : [...token(' extends ', 'keyword'), ...next(type.constraint)]),
      ];
    case 'rest':
      return [...token('...'), ...next(type.elementType)];
    case 'optional':
      return [...next(type.elementType), ...token('?')];
    case 'mapped':
      return [
        ...token('{ '),
        ...(type.readonlyModifier === undefined
          ? []
          : token(
              type.readonlyModifier === '-' ? '-readonly ' : 'readonly ',
              'keyword',
            )),
        ...token('['),
        ...token(type.parameter, 'generic'),
        ...token(' in ', 'keyword'),
        ...next(type.parameterType),
        ...(type.nameType === undefined
          ? []
          : [...token(' as ', 'keyword'), ...next(type.nameType)]),
        ...token(
          `]${type.optionalModifier === '+' ? '?' : type.optionalModifier === '-' ? '-?' : ''}: `,
        ),
        ...next(type.templateType),
        ...token(' }'),
      ];
    case 'templateLiteral':
      return [
        ...token('`', 'literal'),
        ...token(type.head, 'literal'),
        ...type.tail.flatMap(([item, text]) => [
          ...token('${'),
          ...next(item),
          ...token('}'),
          ...token(text, 'literal'),
        ]),
        ...token('`', 'literal'),
      ];
    case 'reflection': {
      const declaration = type.declaration;
      const fields = (declaration.children ?? []).flatMap(child =>
        child.signatures === undefined
          ? [
              [
                ...(child.flags.isReadonly === true
                  ? token('readonly ', 'keyword')
                  : []),
                ...token(child.name, 'name'),
                ...token(child.flags.isOptional === true ? '?: ' : ': '),
                ...next(child.type),
              ],
            ]
          : child.signatures.map(signature => formatSignature(signature)),
      );
      const signatures = (declaration.signatures ?? []).map(signature =>
        formatSignature(signature, true),
      );
      const indexes = (declaration.indexSignatures ?? []).map(signature => [
        ...token('['),
        ...join(
          (signature.parameters ?? []).map(parameter => [
            ...token(parameter.name, 'name'),
            ...token(': '),
            ...next(parameter.type),
          ]),
          ', ',
        ),
        ...token(']: '),
        ...next(signature.type),
      ]);

      const singleSignature = signatures[0];

      if (
        fields.length === 0 &&
        indexes.length === 0 &&
        singleSignature !== undefined
      ) {
        return singleSignature;
      }

      const members = [...fields, ...indexes, ...signatures];
      const compact = [
        ...token('{ '),
        ...join(members, '; '),
        ...token(members.length === 0 ? '}' : '; }'),
      ];

      return members.length < 5 &&
        compact.map(part => part.text).join('').length <= 120
        ? compact
        : [...token('{\n  '), ...join(members, ';\n  '), ...token(';\n}')];
    }
  }
}

export function typeText(type: unknown): string {
  return formatType(type)
    .map(part => part.text)
    .join('');
}
