import { Suspense } from 'react';
import { DocumentLoading } from '../shared/document-loading';
import { lazyComponent } from '../shared/lazy-component';
import type { ManualRouteProps } from './manual-route';

const LazyManualRoute = lazyComponent(() =>
  import('./manual-route.js').then(module => module.ManualRoute),
);

export function ManualRoute<TLocale extends string>(
  props: ManualRouteProps<TLocale>,
) {
  return (
    <Suspense
      fallback={
        <DocumentLoading layout="manual" label={props.messages.loading} />
      }
    >
      <LazyManualRoute {...props} />
    </Suspense>
  );
}
