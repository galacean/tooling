import { Icon } from './icon';

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
  return (
    <div
      className={`docs-sidebar-collapse-region${className === '' ? '' : ` ${className}`}`}
    >
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
