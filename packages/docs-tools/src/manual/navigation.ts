import { isRecord } from '@galacean/docs-site';
import { isSafePathSegment } from '../path-validation';

export interface ManualNavigationItem {
  slug: string;
  title: Record<string, string>;
  group: Record<string, string>;
  format?: Record<string, 'markdown' | 'html'>;
}

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
        (item['format'] === undefined ||
          (isRecord(item['format']) &&
            Object.values(item['format']).every(
              format => format === 'markdown' || format === 'html',
            ))),
    )
  );
}
