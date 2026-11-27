/** Manual navigation slugs may be linked as directories or as source documents. */
export function manualChapterSlug(path: string): string | undefined {
  try {
    return decodeURIComponent(path.replace(/\/$/u, '')).replace(/\.(?:md|html)$/iu, '');
  } catch {
    return undefined;
  }
}

export function isManualAssetPath(path: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|svg|pdf|mp4|webm|zip)$/iu.test(path);
}
