import type { ComponentPropsWithoutRef, CSSProperties } from 'react';
import { Link, NavLink } from 'react-router-dom';

type SiteLinkProps = Omit<ComponentPropsWithoutRef<'a'>, 'href' | 'className' | 'style'> & {
  to: string;
  end?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function SiteLink({ to, end, ...props }: SiteLinkProps) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(to)) {
    return <a {...props} href={to} />;
  }
  if (end !== undefined) {
    return <NavLink {...props} to={to} end={end} />;
  }

  return <Link {...props} to={to} />;
}
