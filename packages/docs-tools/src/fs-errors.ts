export function getErrorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}
