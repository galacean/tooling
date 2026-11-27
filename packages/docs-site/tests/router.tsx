import type { ComponentProps } from 'react';
import { MemoryRouter as Router } from 'react-router-dom';
import { DocsRouterAdapter } from '../src/routing/react-router-adapter';

export * from 'react-router-dom';

export function MemoryRouter({ children, ...props }: ComponentProps<typeof Router>) {
  return (
    <Router {...props}>
      <DocsRouterAdapter>{children}</DocsRouterAdapter>
    </Router>
  );
}
