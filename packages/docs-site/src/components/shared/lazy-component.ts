import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

export function lazyComponent<TProps>(
  load: () => Promise<ComponentType<TProps>>,
): LazyExoticComponent<ComponentType<TProps>> {
  return lazy(async () => ({ default: await load() }));
}
