import { useEffect, useState } from 'react';
import { Icon } from '../shared';

export interface DocsSearchTriggerProps {
  ariaLabel: string;
  label: string;
  onOpen: () => void;
  variant: 'header' | 'sidebar';
  className?: string;
}

export function DocsSearchTrigger({
  ariaLabel,
  label,
  onOpen,
  variant,
  className = '',
}: DocsSearchTriggerProps) {
  const [shortcut, setShortcut] = useState('Ctrl K');

  useEffect(() => {
    setShortcut(
      /Mac|iPhone|iPad|iPod/u.test(navigator.platform) ? '\u2318 K' : 'Ctrl K',
    );
  }, []);

  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        className="docs-sidebar-search-trigger"
        aria-label={ariaLabel}
        onClick={onOpen}
      >
        <span className="docs-sidebar-search-field">
          <Icon name="search" />
          <span>{label}</span>
        </span>
        <kbd>{shortcut}</kbd>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`search-trigger icon-action${className === '' ? '' : ` ${className}`}`}
      aria-label={ariaLabel}
      onClick={onOpen}
    >
      <Icon name="search" />
      <span>{label}</span>
      <kbd>{shortcut}</kbd>
    </button>
  );
}
