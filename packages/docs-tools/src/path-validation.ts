import path from 'node:path';

export function isSafePathSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/\0]/u.test(value)
  );
}

export function isSafeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.includes('\\') &&
    value
      .split('/')
      .every(segment => segment !== '' && segment !== '.' && segment !== '..')
  );
}
