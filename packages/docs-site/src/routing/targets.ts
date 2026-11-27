export interface ManualTarget {
  kind: 'manual';
  locale: string;
  slug?: string | undefined;
  anchor?: string | undefined;
}

export type APITarget =
  | { kind: 'api'; locale: string }
  | { kind: 'package'; locale: string; packageKey: string }
  | {
      kind: 'symbol';
      locale: string;
      packageKey: string;
      version: string;
      entryKey: string;
      symbol: string;
      anchor?: string | undefined;
    };

export type DocsTarget = ManualTarget | APITarget;

export function isDocsTarget(value: unknown): value is DocsTarget {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('locale' in value) ||
    typeof value.locale !== 'string' ||
    !('kind' in value)
  ) {
    return false;
  }
  if ('anchor' in value && typeof value.anchor !== 'string') {
    return false;
  }
  switch (value.kind) {
    case 'manual':
      return !('slug' in value) || typeof value.slug === 'string';
    case 'api':
      return true;
    case 'package':
      return 'packageKey' in value && typeof value.packageKey === 'string';
    case 'symbol':
      return ['packageKey', 'version', 'entryKey', 'symbol'].every(
        key => typeof Reflect.get(value, key) === 'string',
      );
    default:
      return false;
  }
}
