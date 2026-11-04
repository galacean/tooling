import { createHash } from 'node:crypto';
import { indexReflections, isRecord } from '@galacean/docs-site';

export interface CommentPart {
  kind: string;
  text: string;
  [key: string]: unknown;
}

export interface CommentField {
  key: string;
  reflectionId: number;
  field: string;
  parts: CommentPart[];
  sourceLocale: string;
  sourceText: string;
  tokens: CommentPart[];
}

export interface TranslationSource {
  sourceHash: string;
  fields: CommentField[];
}

export interface DocumentationPackage {
  key: string;
  name: string;
  entries: {
    key: string;
    symbols: { name: string; id: number; kind?: number }[];
  }[];
}

interface CommentTag {
  tag: string;
  name?: string;
  content: CommentPart[];
  sourceLocale?: string;
}

interface ReflectionComment {
  summary?: CommentPart[];
  sourceLocale?: string;
  blockTags?: CommentTag[];
}

interface TypeDocReflection extends Record<string, unknown> {
  id: number;
  name: string;
  comment?: ReflectionComment;
  children?: TypeDocReflection[];
  signatures?: TypeDocReflection[];
  parameters?: TypeDocReflection[];
  typeParameters?: TypeDocReflection[];
  getSignature?: TypeDocReflection;
  setSignature?: TypeDocReflection;
  indexSignatures?: TypeDocReflection[];
  type?: TypeDocType;
  sources?: { url?: string; [key: string]: unknown }[];
}

interface TypeDocType extends Record<string, unknown> {
  type: string;
  declaration?: TypeDocReflection;
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function signatureKey(signature: TypeDocReflection): string {
  function normalize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key]) => !['id', 'target', 'sources', 'comment'].includes(key),
          )
          .map(([key, item]) => [key, normalize(item)]),
      );
    }

    return value;
  }

  return contentHash(
    normalize({
      parameters: signature['parameters'],
      typeParameters: signature['typeParameters'],
      type: signature['type'],
    }),
  ).slice(0, 12);
}

export function collectCommentFields(
  project: object,
  packages: DocumentationPackage[],
  { sourceLocale = 'en' }: { sourceLocale?: string } = {},
): CommentField[] {
  const reflections = indexReflections(project);
  const fields = new Map<string, CommentField>();

  function add(
    reflection: TypeDocReflection,
    prefix: string,
    field: string,
    parts: CommentPart[] | undefined,
    fieldSourceLocale = sourceLocale,
  ): void {
    if (parts === undefined || !parts.some(part => part.text.trim() !== '')) {
      return;
    }
    const key = `${prefix}|${field}`;
    const identity = `${reflection.id}|${field}`;

    if (fields.has(identity)) {
      return;
    }
    const tokens: CommentPart[] = [];
    const sourceText = parts
      .map(part => {
        if (part.kind === 'text') {
          return part.text;
        }
        const index = tokens.push(part) - 1;

        return `{{${index}}}`;
      })
      .join('');

    fields.set(identity, {
      key,
      reflectionId: reflection.id,
      field,
      parts,
      sourceLocale: fieldSourceLocale,
      sourceText,
      tokens,
    });
  }

  function visit(reflection: TypeDocReflection, prefix: string): void {
    add(
      reflection,
      prefix,
      'summary',
      reflection.comment?.summary,
      reflection.comment?.sourceLocale ?? sourceLocale,
    );
    for (const [index, tag] of (
      reflection.comment?.blockTags ?? []
    ).entries()) {
      add(
        reflection,
        prefix,
        `${tag.tag}:${tag.name ?? ''}:${index}`,
        tag.content,
        tag.sourceLocale ?? sourceLocale,
      );
    }
    for (const child of reflection.children ?? []) {
      visit(child, `${prefix}.${child.name}`);
    }
    for (const signature of reflection.signatures ?? []) {
      visit(signature, `${prefix}~${signatureKey(signature)}`);
    }
    for (const parameter of reflection.parameters ?? []) {
      visit(parameter, `${prefix}.parameter.${parameter.name}`);
    }
    for (const parameter of reflection.typeParameters ?? []) {
      visit(parameter, `${prefix}.generic.${parameter.name}`);
    }
    for (const name of ['getSignature', 'setSignature'] as const) {
      const signature = reflection[name];

      if (signature !== undefined) {
        visit(signature, `${prefix}.${name}`);
      }
    }
    for (const signature of reflection.indexSignatures ?? []) {
      visit(signature, `${prefix}.index.${signatureKey(signature)}`);
    }

    function visitType(type: unknown, suffix: string): void {
      if (!isRecord(type)) {
        return;
      }
      if (type['type'] === 'reflection') {
        const declaration = type['declaration'];

        if (
          isRecord(declaration) &&
          typeof declaration['id'] === 'number' &&
          typeof declaration['name'] === 'string'
        ) {
          visit(declaration as TypeDocReflection, `${prefix}${suffix}.object`);
        }

        return;
      }
      for (const [name, value] of Object.entries(type)) {
        if (Array.isArray(value)) {
          value.forEach((item, index) =>
            visitType(item, `${suffix}.${name}.${index}`),
          );
        } else if (value !== null && typeof value === 'object') {
          visitType(value, `${suffix}.${name}`);
        }
      }
    }

    visitType(reflection.type, '');
  }

  for (const pkg of packages) {
    if (typeof pkg.name !== 'string' || pkg.name.length === 0) {
      throw new Error(`Missing API package name: ${pkg.key}`);
    }

    for (const entry of pkg.entries) {
      for (const symbol of entry.symbols) {
        const reflection = reflections.get(symbol.id);

        if (reflection === undefined) {
          throw new Error(
            `Missing documented reflection: ${pkg.key}/${symbol.name}`,
          );
        }
        visit(
          reflection as TypeDocReflection,
          `${pkg.name}|${entry.key}|${symbol.name}`,
        );
      }
    }
  }
  const result = [...fields.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );

  if (new Set(result.map(field => field.key)).size !== result.length) {
    throw new Error('Duplicate current API translation field key');
  }

  return result;
}

export function translateParts(
  field: CommentField,
  text: string,
): CommentPart[] {
  const pieces = text.split(/(\{\{\d+\}\})/u);
  const used = new Set<number>();

  return pieces
    .filter(piece => piece !== '')
    .map(piece => {
      const token = /^\{\{(\d+)\}\}$/u.exec(piece);

      if (token === null) {
        return { kind: 'text', text: piece };
      }
      const index = Number(token[1]);

      if (
        field.tokens[index] === undefined ||
        used.has(index) ||
        String(index) !== token[1]
      ) {
        throw new Error(`Invalid translation token in ${field.key}: ${piece}`);
      }
      used.add(index);

      return structuredClone(field.tokens[index]);
    })
    .concat(
      used.size === field.tokens.length
        ? []
        : (() => {
            throw new Error(`Missing translation tokens: ${field.key}`);
          })(),
    );
}

export function buildTranslationSource(
  project: object,
  packages: DocumentationPackage[],
  options: { sourceLocale?: string } = {},
): TranslationSource {
  const normalized = structuredClone(project) as TypeDocReflection;
  const fields = collectCommentFields(project, packages, options);

  for (const reflection of indexReflections(normalized).values()) {
    for (const source of (reflection as TypeDocReflection).sources ?? []) {
      delete source.url;
    }
  }

  return {
    sourceHash: contentHash({
      project: normalized,
      packages,
      fields: fields.map(({ key, sourceLocale }) => ({ key, sourceLocale })),
    }),
    fields,
  };
}

export function validateTranslation(
  value: unknown,
  source: TranslationSource,
  locale: string,
  version?: string,
): Record<string, string> {
  const fields = source.fields.filter(field => field.sourceLocale !== locale);

  if (fields.length === 0 && value === undefined) {
    return {};
  }
  if (
    !isRecord(value) ||
    value['sourceHash'] !== source.sourceHash ||
    (version !== undefined && value['version'] !== version) ||
    !isRecord(value['translations']) ||
    Object.keys(value).some(
      key => !['version', 'sourceHash', 'translations'].includes(key),
    )
  ) {
    throw new Error(
      `Complete current API translation required: ${locale} (sourceHash ${source.sourceHash})`,
    );
  }
  const translations = value['translations'];
  const keys = new Set(fields.map(field => field.key));

  for (const key of Object.keys(translations)) {
    if (!keys.has(key)) {
      throw new Error(
        `Unknown current API translation field: ${locale}/${key}`,
      );
    }
  }
  for (const field of fields) {
    const text = translations[keyFor(field)];

    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error(
        `Missing current API translation: ${locale}/${field.key}`,
      );
    }
    translateParts(field, text);
  }

  return translations as Record<string, string>;
}

function keyFor(field: CommentField): string {
  return field.key;
}

export function localizeProject<T extends object>(
  project: T,
  source: TranslationSource,
  translation: unknown,
  locale: string,
): T & { locale: string } {
  const translations = validateTranslation(translation, source, locale);

  return localizeProjectWithFallback(project, source, translations, locale);
}

export function localizeProjectWithFallback<T extends object>(
  project: T,
  source: TranslationSource,
  translations: Record<string, string>,
  locale: string,
): T & { locale: string } {
  const localized = structuredClone(project);
  const reflections = indexReflections(localized);

  for (const field of source.fields) {
    const translatedText = translations[field.key];
    const isTranslated =
      field.sourceLocale !== locale && translatedText !== undefined;
    const parts =
      field.sourceLocale === locale || !isTranslated
        ? structuredClone(field.parts)
        : translateParts(field, translatedText);
    const sourceLocale = isTranslated ? locale : field.sourceLocale;
    const reflection = reflections.get(field.reflectionId);

    if (!isRecord(reflection) || !isRecord(reflection['comment'])) {
      throw new Error(
        `Missing TypeDoc comment for translation field: ${field.key}`,
      );
    }
    const comment = reflection['comment'];

    if (field.field === 'summary') {
      comment['summary'] = parts;
      comment['sourceLocale'] = sourceLocale;
    } else {
      const index = Number(field.field.slice(field.field.lastIndexOf(':') + 1));
      const blockTags = comment['blockTags'];

      if (!Array.isArray(blockTags) || !isRecord(blockTags[index])) {
        throw new Error(
          `Missing TypeDoc block tag for translation field: ${field.key}`,
        );
      }
      blockTags[index]['content'] = parts;
      blockTags[index]['sourceLocale'] = sourceLocale;
    }
  }
  (localized as Record<string, unknown>)['locale'] = locale;

  return localized as T & { locale: string };
}
