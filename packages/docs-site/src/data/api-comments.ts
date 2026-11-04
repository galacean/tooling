import type { ReflectionIndex } from './api-reflection-index';
import { isRecord } from './typedoc-project';

export interface APICommentContent<
  TLocale extends string,
  TPart extends { text: string },
> {
  parts: TPart[];
  sourceLocale?: TLocale;
}

export interface APICommentPartLike {
  kind: string;
  text: string;
  target?: unknown;
  targetAnchor?: string;
}

export interface APICommentContext<
  TProject extends object,
  TReflection extends object,
> {
  project: TProject;
  index: ReflectionIndex<TReflection>;
  locale: string;
  version: string;
  commit: string;
}

export function getAPICommentContent<
  TLocale extends string,
  TPart extends { text: string },
>(
  reflection: object,
  field: string,
  isLocale: (value: unknown) => value is TLocale,
): APICommentContent<TLocale, TPart> | undefined {
  const comment = isRecord(reflection) ? reflection['comment'] : undefined;
  const blockIndex = Number(field.slice(field.lastIndexOf(':') + 1));
  const commentRecord = isRecord(comment) ? comment : undefined;
  const blockTags = commentRecord?.['blockTags'];
  const blockTag: unknown = (
    Array.isArray(blockTags) ? blockTags[blockIndex] : undefined
  ) as unknown;
  const value: unknown = field === 'summary' ? commentRecord : blockTag;
  const valueRecord = isRecord(value) ? value : undefined;
  const parts =
    field === 'summary' ? commentRecord?.['summary'] : valueRecord?.['content'];
  const sourceLocale = valueRecord?.['sourceLocale'];

  if (!Array.isArray(parts) || parts.length === 0) {
    return undefined;
  }

  return {
    parts: parts as TPart[],
    ...(isLocale(sourceLocale) ? { sourceLocale } : {}),
  };
}

export function resolveAPIMarkdownLink<
  TProject extends object,
  TReflection extends object,
>(
  url: string,
  reflection: TReflection,
  context: APICommentContext<TProject, TReflection>,
  getRepositoryFileURL: (revision: string, filePath?: string) => string,
): string {
  if (!url.startsWith('.')) {
    return url;
  }

  let current: TReflection | undefined = reflection;

  while (current !== undefined) {
    const record: Record<string, unknown> | undefined = isRecord(current)
      ? current
      : undefined;
    const sources = record?.['sources'];
    const source =
      Array.isArray(sources) && isRecord(sources[0]) ? sources[0] : undefined;

    if (typeof source?.['fileName'] === 'string') {
      return new URL(
        url,
        getRepositoryFileURL(context.commit, source['fileName']),
      ).href;
    }

    const id: unknown = record?.['id'];
    const parent: number | undefined =
      typeof id === 'number' ? context.index.parents.get(id) : undefined;

    current = parent === undefined ? undefined : context.index.byId.get(parent);
  }

  return new URL(url, getRepositoryFileURL(context.commit)).href;
}

export function resolveAPICommentLink<
  TProject extends object,
  TReflection extends object,
>(
  part: APICommentPartLike,
  context: APICommentContext<TProject, TReflection>,
  getRepositoryFileURL: (revision: string, filePath?: string) => string,
): string | undefined {
  if (part.kind === 'inline-tag') {
    if (typeof part.target === 'string') {
      return part.target;
    }
    const target = context.index.resolve(part.target);

    return target === undefined
      ? undefined
      : context.index.url(
          context.locale,
          context.version,
          isRecord(target) && typeof target['id'] === 'number'
            ? target['id']
            : -1,
        );
  }

  if (part.kind === 'relative-link' && part.target !== undefined) {
    const project = isRecord(context.project) ? context.project : undefined;
    const files = isRecord(project?.['files']) ? project['files'] : undefined;
    const reflections = isRecord(files?.['reflections'])
      ? files['reflections']
      : undefined;
    const entries = isRecord(files?.['entries']) ? files['entries'] : undefined;
    const id = reflections?.[String(part.target)];
    const url =
      typeof id === 'number'
        ? context.index.url(context.locale, context.version, id)
        : undefined;

    if (url !== undefined) {
      return part.targetAnchor === undefined
        ? url
        : `${url.split('#')[0]}#${encodeURIComponent(part.targetAnchor)}`;
    }

    const file = entries?.[String(part.target)];

    return typeof file !== 'string'
      ? undefined
      : `${getRepositoryFileURL(
          context.version === 'current' ? context.commit : context.version,
          file,
        )}${part.targetAnchor === undefined ? '' : `#${part.targetAnchor}`}`;
  }

  return undefined;
}
