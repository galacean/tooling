import { useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { Icon } from './icon';

const MIN_SIDEBAR_WIDTH = 259;
const MAX_SIDEBAR_WIDTH = 480;
const SIDEBAR_WIDTH_STORAGE_KEY = 'docs-site-sidebar-width';

interface SidebarDrag {
  pointerId: number;
  startX: number;
  startWidth: number;
  inlineDirection: number;
  width: number;
  previousUserSelect: string;
}

function inlineDirection(handle: HTMLElement): number {
  return handle.closest('[dir]')?.getAttribute('dir') === 'rtl' ? -1 : 1;
}

function clampSidebarWidth(width: number) {
  return Math.round(
    Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width)),
  );
}

export interface DocsSidebarCollapseProps {
  label: string;
  expanded: boolean;
  controlsId: string;
  onToggle: () => void;
  className?: string;
}

export function DocsSidebarCollapse({
  label,
  expanded,
  controlsId,
  onToggle,
  className = '',
}: DocsSidebarCollapseProps) {
  const [sidebarWidth, setSidebarWidth] = useState(MIN_SIDEBAR_WIDTH);
  const drag = useRef<SidebarDrag | null>(null);

  useEffect(() => {
    const savedWidth = Number(
      window.sessionStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY),
    );
    const hasSavedWidth =
      Number.isFinite(savedWidth) &&
      savedWidth >= MIN_SIDEBAR_WIDTH &&
      savedWidth <= MAX_SIDEBAR_WIDTH;
    const targetWidth =
      document.getElementById(controlsId)?.getBoundingClientRect().width ?? 0;

    if (hasSavedWidth) {
      document.documentElement.style.setProperty(
        '--site-doc-sidebar-width',
        `${savedWidth}px`,
      );
      setSidebarWidth(savedWidth);
    } else if (targetWidth > 0) {
      setSidebarWidth(clampSidebarWidth(targetWidth));
    }

    return () => {
      if (drag.current !== null) {
        document.documentElement.removeAttribute('data-sidebar-resizing');
        document.body.style.userSelect = drag.current.previousUserSelect;
      }
    };
  }, [controlsId, expanded]);

  const applyWidth = (width: number) => {
    const nextWidth = clampSidebarWidth(width);

    document.documentElement.style.setProperty(
      '--site-doc-sidebar-width',
      `${nextWidth}px`,
    );
    setSidebarWidth(nextWidth);

    return nextWidth;
  };

  const persistWidth = (width: number) => {
    window.sessionStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, `${width}`);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !expanded ||
      (event.button !== undefined && event.button !== 0)
    ) {
      return;
    }

    const targetWidth =
      document.getElementById(controlsId)?.getBoundingClientRect().width ?? 0;

    if (targetWidth <= 0) {
      return;
    }

    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      inlineDirection: inlineDirection(event.currentTarget),
      startWidth: targetWidth,
      width: clampSidebarWidth(targetWidth),
      previousUserSelect: document.body.style.userSelect,
    };
    document.documentElement.dataset['sidebarResizing'] = 'true';
    document.body.style.userSelect = 'none';
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      drag.current === null ||
      drag.current.pointerId !== event.pointerId
    ) {
      return;
    }

    drag.current.width = applyWidth(
      drag.current.startWidth + (event.clientX - drag.current.startX) * drag.current.inlineDirection,
    );
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      drag.current === null ||
      drag.current.pointerId !== event.pointerId
    ) {
      return;
    }

    const activeDrag = drag.current;

    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    document.documentElement.removeAttribute('data-sidebar-resizing');
    document.body.style.userSelect = activeDrag.previousUserSelect;
    persistWidth(activeDrag.width);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number;
    const step = (event.shiftKey ? 32 : 16) * inlineDirection(event.currentTarget);

    switch (event.key) {
      case 'ArrowLeft':
        nextWidth = sidebarWidth - step;

        break;
      case 'ArrowRight':
        nextWidth = sidebarWidth + step;

        break;
      case 'Home':
        nextWidth = MIN_SIDEBAR_WIDTH;

        break;
      case 'End':
        nextWidth = MAX_SIDEBAR_WIDTH;

        break;
      default:
        return;
    }

    event.preventDefault();
    persistWidth(applyWidth(nextWidth));
  };

  return (
    <div
      className={`docs-sidebar-collapse-region${className === '' ? '' : ` ${className}`}`}
    >
      {expanded && (
        <div
          className="docs-sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-controls={controlsId}
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onLostPointerCapture={handlePointerEnd}
          onKeyDown={handleKeyDown}
        />
      )}
      <button
        type="button"
        className="docs-sidebar-collapse icon-action"
        aria-label={label}
        title={label}
        aria-expanded={expanded}
        aria-controls={controlsId}
        onClick={onToggle}
      >
        <Icon
          name={expanded ? 'chevronLeft' : 'chevronRight'}
          style={{ width: 10, height: 10 }}
        />
      </button>
    </div>
  );
}
