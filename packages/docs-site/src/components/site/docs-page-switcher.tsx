import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../shared';
import type { IconName } from '../shared/icon';

export interface DocsPageSwitcherItem {
  key: string;
  label: string;
  href: string;
  icon: IconName;
}

export function DocsPageSwitcher({
  ariaLabel,
  currentHref,
  items,
  label,
}: {
  ariaLabel: string;
  currentHref: string;
  items: DocsPageSwitcherItem[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        root.current !== null &&
        !root.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      (
        menu.current?.querySelector<HTMLElement>('[aria-current="page"]') ??
        menu.current?.querySelector<HTMLElement>('[role="menuitem"]')
      )?.focus();
    }
  }, [open]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }
    const menuItems = Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );

    if (menuItems.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = menuItems.indexOf(
      document.activeElement as HTMLElement,
    );
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? menuItems.length - 1
          : (currentIndex +
              (event.key === 'ArrowDown' ? 1 : -1) +
              menuItems.length) %
            menuItems.length;

    menuItems[nextIndex]?.focus();
  };

  return (
    <div className="docs-page-switcher" ref={root}>
      <Link
        className="docs-page-switcher-current"
        to={currentHref}
        title={label}
      >
        {label}
      </Link>
      <button
        ref={trigger}
        type="button"
        className="docs-page-switcher-trigger icon-action"
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(value => !value)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div
          className="docs-page-switcher-menu docs-dropdown-menu docs-scroll-area"
          id={menuId}
          ref={menu}
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map(item => (
            <Link
              key={item.key}
              to={item.href}
              role="menuitem"
              tabIndex={-1}
              className="docs-dropdown-item"
              aria-current={item.href === currentHref ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
