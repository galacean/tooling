export function localePath(
  locale: string,
  segments: string[] = [],
  search = '',
  hash = '',
): string {
  const pathname = `/${locale}/${segments.map(encodeURIComponent).join('/')}${segments.length > 0 ? '/' : ''}`;

  return `${pathname}${search}${hash}`;
}

export function apiPackagePath(locale: string, packageKey: string): string {
  return localePath(locale, ['api', packageKey]);
}

export function apiSymbolPath(
  locale: string,
  packageKey: string,
  version: string,
  symbol: string,
  entry = 'root',
  hash = '',
): string {
  const search = entry === 'root' ? '' : `?entry=${encodeURIComponent(entry)}`;

  return localePath(
    locale,
    ['api', packageKey, version, symbol],
    search,
    hash === '' ? '' : `#${encodeURIComponent(hash)}`,
  );
}

export function switchLocale(
  pathname: string,
  locale: string,
  search: string,
  hash: string,
): string {
  const segments = pathname
    .split('/')
    .filter(segment => segment !== '')
    .slice(1)
    .map(decodeURIComponent);

  return localePath(locale, segments, search, hash);
}

export function normalizeBase(value: string): string {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/u.test(value)) {
    throw new Error(`SITE_BASE_PATH must start and end with /: ${value}`);
  }

  return value;
}

export function withBase(route: string, base: string): string {
  return `${normalizeBase(base)}${route.replace(/^\//u, '')}`;
}
