import { Suspense } from 'react';
import { lazyComponent } from '../shared/lazy-component';
import type { SearchPanelProps } from './search-panel';

export const LazySearchPanel = lazyComponent(() =>
  import('./search-panel.js').then(module => module.SearchPanel),
);

export function SearchPanel(props: SearchPanelProps) {
  return (
    <Suspense fallback={null}>
      <LazySearchPanel {...props} />
    </Suspense>
  );
}
