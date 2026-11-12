import type { SVGProps } from 'react';
import {
  RiArrowRightLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiArrowDownSFill,
  RiArrowDownSLine,
  RiArrowUpLine,
  RiBookOpenLine,
  RiCloseLine,
  RiCodeLine,
  RiComputerLine,
  RiEyeOffLine,
  RiEyeLine,
  RiFocus3Line,
  RiGithubFill,
  RiHomeLine,
  RiListUnordered,
  RiMenuFoldLine,
  RiMenuLine,
  RiMenuUnfoldLine,
  RiMoonLine,
  RiMore2Line,
  RiPauseLine,
  RiPlayLine,
  RiRefreshLine,
  RiSearchLine,
  RiSunLine,
  RiTimeLine,
  RiTranslate2,
} from '@remixicon/react';

const icons = {
  search: RiSearchLine,
  menu: RiMenuLine,
  more: RiMore2Line,
  pause: RiPauseLine,
  play: RiPlayLine,
  close: RiCloseLine,
  arrow: RiArrowRightLine,
  top: RiArrowUpLine,
  source: RiCodeLine,
  refresh: RiRefreshLine,
  language: RiTranslate2,
  directory: RiListUnordered,
  sun: RiSunLine,
  moon: RiMoonLine,
  system: RiComputerLine,
  book: RiBookOpenLine,
  home: RiHomeLine,
  focus: RiFocus3Line,
  locate: RiFocus3Line,
  collapse: RiMenuFoldLine,
  expand: RiMenuUnfoldLine,
  hideOutline: RiEyeOffLine,
  chevronRight: RiArrowRightSLine,
  chevronLeft: RiArrowLeftSLine,
  chevronDownFill: RiArrowDownSFill,
  chevronDown: RiArrowDownSLine,
  clock: RiTimeLine,
  eyeOff: RiEyeOffLine,
  eye: RiEyeLine,
} as const;

export type IconName = keyof typeof icons | 'github';

export function Icon({
  name,
  ...props
}: Omit<
  SVGProps<SVGSVGElement>,
  'children' | 'color' | 'width' | 'height' | 'size'
> & {
  name: IconName;
}) {
  const IconComponent = name === 'github' ? RiGithubFill : icons[name];

  return (
    <IconComponent
      size={18}
      color="currentColor"
      fill="currentColor"
      aria-hidden={props['aria-label'] === undefined ? true : undefined}
      role={props['aria-label'] === undefined ? undefined : 'img'}
      data-icon={name}
      {...props}
    />
  );
}
