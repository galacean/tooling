import type { SVGProps } from 'react';
import { iconPaths } from './remix-icon-paths';

export type IconName = keyof typeof iconPaths;

export function Icon({
  name,
  ...props
}: Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'size'> & {
  name: IconName;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="currentColor"
      aria-hidden={props['aria-label'] === undefined ? true : undefined}
      role={props['aria-label'] === undefined ? undefined : 'img'}
      {...props}
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
