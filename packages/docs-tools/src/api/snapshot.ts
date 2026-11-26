import { isRecord } from '@galacean/docs-site';
import { contentHash } from './translations';

export function sourceProject<T extends Record<string, unknown>>(
  snapshot: T,
): T {
  if (!isRecord(snapshot)) {
    throw new Error('Invalid localized API snapshot');
  }
  const project = structuredClone(snapshot);

  delete project['locale'];
  delete project['apiSnapshot'];

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);

      return;
    }
    if (!isRecord(value)) {
      return;
    }
    const comment = value['comment'];

    if (isRecord(comment)) {
      delete comment['sourceLocale'];
      const blockTags = comment['blockTags'];

      if (Array.isArray(blockTags)) {
        for (const tag of blockTags) {
          if (isRecord(tag)) {
            delete tag['sourceLocale'];
          }
        }
      }
    }
    Object.values(value).forEach(visit);
  }

  visit(project);

  return project;
}

/** Manifest revision written by api apply for a translated set of snapshots. */
export function localizedSnapshotHash(source: Record<string, unknown>, locales: Record<string, unknown>): string {
  return contentHash({ source: sourceProject(source), metadata: source['apiSnapshot'], locales });
}
