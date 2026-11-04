import { isRecord } from './typedoc-project';

export interface APIReadmeData<TLocale extends string> {
  text: string;
  sourceLocale: TLocale;
}

export interface APIReadmeLinkOptions<TLocale extends string> {
  locales: readonly TLocale[];
  packageReadmes: Record<string, Partial<Record<TLocale, string>>>;
  getPackageHref: (locale: TLocale, packageKey: string) => string;
  getRepositoryURL: (pathname: string, search: string, hash: string) => string;
}

export async function loadAPIReadmeData<TLocale extends string>(
  packageKey: string,
  locale: TLocale,
  baseURL: string,
  loadJSON: (url: string) => Promise<unknown>,
  isLocale: (value: unknown) => value is TLocale,
): Promise<APIReadmeData<TLocale>> {
  if (!/^[a-z0-9-]+$/u.test(packageKey)) {
    throw new Error(`Invalid API package key: ${packageKey}`);
  }
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  const result = await loadJSON(
    `${base}data/package-readmes/${packageKey}/${locale}.json`,
  );

  if (
    !isRecord(result) ||
    typeof result['text'] !== 'string' ||
    !isLocale(result['sourceLocale'])
  ) {
    throw new Error(`Invalid package README data: ${packageKey}/${locale}`);
  }

  return { text: result['text'], sourceLocale: result['sourceLocale'] };
}

export function resolveAPIReadmeLink<TLocale extends string>(
  packageKey: string,
  href: string,
  options: APIReadmeLinkOptions<TLocale>,
): string {
  if (href.startsWith('#') || /^(?:https?:|mailto:|tel:|\/\/)/u.test(href)) {
    return href;
  }
  const target = new URL(
    href,
    `https://local.invalid/packages/${packageKey}/README.md`,
  );
  const packageReadme =
    /^\/packages\/([a-z0-9-]+)\/README(?:-[a-zA-Z0-9_-]+)?\.md$/u.exec(
      target.pathname,
    );
  const targetPackageKey = packageReadme?.[1];

  if (targetPackageKey !== undefined) {
    const readmes = options.packageReadmes[targetPackageKey];
    const path = target.pathname.replace(/^\//u, '');
    const locale = options.locales.find(
      candidate => readmes?.[candidate] === path,
    );

    if (locale !== undefined) {
      return `${options.getPackageHref(locale, targetPackageKey)}${target.hash}`;
    }
  }

  return options.getRepositoryURL(target.pathname, target.search, target.hash);
}

export function resolveAPIReadmeImage(
  packageKey: string,
  src: string,
  getRepositoryRawURL: (pathname: string, search: string) => string,
): string {
  if (/^(?:https?:|data:|\/)/u.test(src)) {
    return src;
  }
  const target = new URL(
    src,
    `https://local.invalid/packages/${packageKey}/README.md`,
  );

  return getRepositoryRawURL(target.pathname, target.search);
}
