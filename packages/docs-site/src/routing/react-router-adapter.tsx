import type { ReactNode } from 'react';
import { useHref, useLocation, useNavigate } from 'react-router-dom';
import { DocsNavigationProvider } from './navigation';

/** Adapts an existing React Router; never creates a second history or router. */
export function DocsRouterAdapter({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const base = useHref('/');

  return (
    <DocsNavigationProvider
      navigation={{
        location,
        navigate,
        getHref: to => (to.startsWith('/') ? `${base.replace(/\/$/u, '')}${to}` : to),
      }}
    >
      {children}
    </DocsNavigationProvider>
  );
}
