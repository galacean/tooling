export function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
