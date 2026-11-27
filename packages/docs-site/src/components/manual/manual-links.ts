import type { ManualNavigationPage } from '../../manual/document';
import { isManualAssetPath, manualChapterSlug } from '../../manual/links';
import type { ContentLink } from '../shared/content-link';

export function resolveManualLink(
  raw: string,
  slug: string | undefined,
  pages: ManualNavigationPage[] | undefined,
  href: (slug?: string, anchor?: string) => string,
  assetHref?: (path: string) => string,
  image = false,
): ContentLink {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(raw)) {
    return raw;
  }
  const overview = href();
  const hasRouteDirectory = /^\/[^?#]*\/$/u.test(overview);

  if (raw.startsWith('/') && !hasRouteDirectory) {
    return raw;
  }
  const prefix = hasRouteDirectory ? overview : '/manual/';
  const directory = slug === undefined ? prefix : prefix + encodeURIComponent(slug) + '/';
  const url = new URL(raw, 'https://manual.invalid' + directory);

  if (!url.pathname.startsWith(prefix)) {
    return hasRouteDirectory && !image ? url.pathname + url.search + url.hash : raw;
  }
  const path = url.pathname.slice(prefix.length);
  const name = manualChapterSlug(path);

  if (!image && name !== undefined && (name === '' || pages?.some(page => page.slug === name) === true)) {
    let anchor: string;

    try {
      anchor = decodeURIComponent(url.hash.slice(1));
    } catch {
      return raw;
    }
    const chapter = href(name || undefined, anchor || undefined);

    if (!url.search) {
      return chapter;
    }
    // A host can use its own query parameters to select the chapter.
    const hashStart = chapter.indexOf('#');
    const beforeHash = hashStart < 0 ? chapter : chapter.slice(0, hashStart);
    const hash = hashStart < 0 ? '' : chapter.slice(hashStart);

    return beforeHash + (beforeHash.includes('?') ? '&' + url.search.slice(1) : url.search) + hash;
  }
  if (image || isManualAssetPath(path)) {
    return { resource: assetHref?.(path + url.search + url.hash) ?? raw };
  }

  return raw;
}
