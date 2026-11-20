import type { ReactNode } from 'react';
import type { DocsSitePage, DocsSitePageDeclaration } from './types';

export function bindDocsSitePages<TLocale extends string>(
  declarations: readonly DocsSitePageDeclaration<TLocale>[],
  renderers: Readonly<Record<string, (locale: TLocale) => ReactNode>>,
): DocsSitePage<TLocale>[] {
  const homeKey = Object.hasOwn(renderers, '/') || declarations.some(page => page.slug === 'home')
    ? '/'
    : 'home';

  return declarations.map(page => {
    const key = page.slug ?? homeKey;
    const render = Object.hasOwn(renderers, key) ? renderers[key] : undefined;

    if (render === undefined) {
      throw new Error(`Missing page renderer for ${key}`);
    }

    return { ...page, render };
  });
}
