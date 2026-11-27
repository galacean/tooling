import { createContext, useCallback, useContext } from 'react';
import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from 'react';

export interface DocsLocation {
  pathname: string;
  search: string;
  hash: string;
}

export interface DocsNavigation {
  location: DocsLocation;
  navigate?: (to: string, options?: { replace?: boolean }) => void | Promise<void>;
  getHref?: (to: string) => string;
}

const NavigationContext = createContext<DocsNavigation>({
  location: { pathname: '', search: '', hash: '' },
});

/** Supplies host navigation without creating a router or subscribing to browser history. */
export function DocsNavigationProvider({
  navigation,
  children,
}: {
  navigation?: DocsNavigation | undefined;
  children: ReactNode;
}) {
  const inherited = useDocsNavigation();

  return navigation === undefined ? children : (
    <NavigationContext value={{ ...inherited, ...navigation }}>{children}</NavigationContext>
  );
}

export function useDocsNavigation(): DocsNavigation {
  return useContext(NavigationContext);
}

export function useDocsLocation(): DocsLocation {
  return useContext(NavigationContext).location;
}

export function useDocsNavigate() {
  const { navigate, getHref } = useContext(NavigationContext);

  return useCallback(
    (to: string, options?: { replace?: boolean }) => {
      if (navigate !== undefined) {
        return navigate(to, options);
      }
      const href = getHref?.(to) ?? to;

      if (options?.replace === true) {
        window.location.replace(href);
      } else {
        window.location.assign(href);
      }
    },
    [navigate, getHref],
  );
}

export interface DocsLinkProps extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  to: string;
  end?: boolean;
}

export function isExternalHref(to: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(to);
}

export function canNavigateLink(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  return !event.defaultPrevented && event.button === 0 &&
    !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
    !anchor.hasAttribute('download') && (anchor.target === '' || anchor.target === '_self');
}

export function DocsLink({ to, end, onClick, ...props }: DocsLinkProps) {
  const { location, navigate, getHref } = useContext(NavigationContext);
  const external = isExternalHref(to);
  const pathname = to.split(/[?#]/u)[0] ?? '';
  const active =
    end === undefined
      ? undefined
      : end
        ? location.pathname.replace(/\/$/u, '') === pathname.replace(/\/$/u, '')
        : location.pathname === pathname ||
          location.pathname.startsWith(`${pathname.replace(/\/$/u, '')}/`);

  return (
    <a
      {...props}
      href={external ? to : (getHref?.(to) ?? to)}
      {...(active === true ? { 'aria-current': 'page' as const } : {})}
      onClick={event => {
        onClick?.(event);
        if (external || navigate === undefined || !canNavigateLink(event, event.currentTarget)) {
          return;
        }
        event.preventDefault();
        void navigate(to);
      }}
    />
  );
}
