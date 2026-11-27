import { Suspense } from 'react';
import type { DocsSiteOptions, DocsSitePage } from '../../config/types';
import { lazyComponent } from '../shared/lazy-component';

export interface DocsSiteProps<TLocale extends string> {
  config: DocsSiteOptions<TLocale>;
  pages: readonly DocsSitePage<TLocale>[];
}

const LazyDocsSite = /* @__PURE__ */ lazyComponent(() =>
  import('./docs-site-runtime.js').then(module => module.DocsSite),
) as typeof import('./docs-site-runtime').DocsSite;

/** Loads the full site's router only when the site is mounted. */
export function DocsSite<TLocale extends string>(props: DocsSiteProps<TLocale>) {
  return (
    <Suspense fallback={null}>
      <LazyDocsSite {...props} />
    </Suspense>
  );
}
