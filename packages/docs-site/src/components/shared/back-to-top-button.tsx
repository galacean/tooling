import type { RefObject } from 'react';
import { Icon } from './icon';

export interface BackToTopButtonProps<TElement extends HTMLElement> {
  label: string;
  scrollRef: RefObject<TElement | null>;
}

export function BackToTopButton<TElement extends HTMLElement>({
  label,
  scrollRef,
}: BackToTopButtonProps<TElement>) {
  return (
    <button
      type="button"
      className="docs-back-top icon-action"
      aria-label={label}
      title={label}
      onClick={() =>
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }
    >
      <Icon name="top" />
    </button>
  );
}
