import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export type SelectOption = { value: string; label: string };

export function SelectControl({
  ariaLabel,
  className = '',
  icon,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  icon?: ReactNode;
  onChange: (value: string) => void;
  options: SelectOption[];
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex(option => option.value === value),
  );
  const activeOption = options[activeIndex];
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  useEffect(() => {
    if (open) {
      optionRefs.current[activeIndex]?.focus();
    }
  }, [activeIndex, open]);
  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const rootElement = root.current;

      if (
        event.target instanceof Node &&
        (rootElement === null || !rootElement.contains(event.target))
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);

    return () =>
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  const openMenu = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  };
  const choose = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();

      return;
    }
    if (event.key === 'Tab' && open) {
      setOpen(false);

      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (open && activeOption !== undefined) {
        event.preventDefault();
        choose(activeOption);
      }

      return;
    }
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Home' ||
      event.key === 'End'
    ) {
      event.preventDefault();

      if (options.length === 0) {
        return;
      }
      const lastIndex = Math.max(0, options.length - 1);

      if (!open) {
        setActiveIndex(
          event.key === 'ArrowUp' || event.key === 'End'
            ? lastIndex
            : selectedIndex,
        );
        setOpen(true);

        return;
      }
      if (event.key === 'Home') {
        setActiveIndex(0);
      } else if (event.key === 'End') {
        setActiveIndex(lastIndex);
      } else {
        const direction = event.key === 'ArrowDown' ? 1 : -1;

        setActiveIndex(
          index => (index + direction + options.length) % options.length,
        );
      }
    }
  };

  return (
    <div className={`site-select ${className}`} ref={root}>
      <button
        ref={trigger}
        type="button"
        className={
          icon === undefined
            ? 'site-select-trigger'
            : 'site-select-trigger icon-only icon-action'
        }
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
      >
        {icon ?? (
          <span className="site-select-value">
            {options[selectedIndex]?.label ?? value}
          </span>
        )}
        <span className="site-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={listboxId}
          className="site-select-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option, index) => (
            <div
              ref={element => {
                optionRefs.current[index] = element;
              }}
              id={optionId(index)}
              key={option.value}
              role="option"
              tabIndex={-1}
              aria-selected={option.value === value}
              className={
                index === activeIndex
                  ? 'site-select-option active'
                  : 'site-select-option'
              }
              onKeyDown={handleKeyDown}
              onPointerDown={event => event.preventDefault()}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
