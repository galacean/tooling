import { isRecord } from '@galacean/docs-site';
import type { ManualNavigationItem as PublishedManualItem } from '@galacean/docs-site';
import { isSafePathSegment } from '../path-validation';

export type ManualNavigationItem = Pick<
  PublishedManualItem<string>,
  'slug' | 'contentLocales' | 'translationStatus' | 'title' | 'group' | 'format'
>;

function isLocalizedRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every(item => typeof item === 'string')
  );
}

export function isManualNavigation(
  value: unknown,
): value is ManualNavigationItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        isRecord(item) &&
        typeof item['slug'] === 'string' &&
        isSafePathSegment(item['slug']) &&
        isLocalizedRecord(item['title']) &&
        isLocalizedRecord(item['group']) &&
        (item['contentLocales'] === undefined || isLocalizedRecord(item['contentLocales'])) &&
        (item['translationStatus'] === undefined || (isLocalizedRecord(item['translationStatus']) && Object.values(item['translationStatus']).every(value => ['source', 'translated', 'missing', 'needs-review'].includes(value)))) &&
        (item['format'] === undefined ||
          (isRecord(item['format']) &&
            Object.values(item['format']).every(
              format => format === 'markdown' || format === 'html',
            ))),
    )
  );
}
