import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { BackToTopButton, DocsSidebarCollapse, Icon } from '../shared';

export interface APIReferenceLayoutProps {
  messages: {
    api: string;
    menu: string;
    close: string;
    top: string;
    collapseSidebar?: string;
    expandSidebar?: string;
  };
  renderNavigation: (close: () => void) => ReactNode;
  toolbar: ReactNode;
  children: ReactNode;
  navigationKey: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  drawerOpen: boolean;
  onDrawerChange: (open: boolean) => void;
}

export function APIReferenceLayout({
  messages: t,
  renderNavigation,
  toolbar,
  children,
  navigationKey,
  scrollRef,
  collapsed,
  onToggleCollapsed,
  drawerOpen,
  onDrawerChange,
}: APIReferenceLayoutProps) {
  const drawerRef = useRef<HTMLDialogElement>(null);
  const sidebar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sidebar.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [navigationKey, collapsed]);
  useEffect(() => {
    const dialog = drawerRef.current;

    if (dialog === null) {
      return;
    }
    if (drawerOpen && !dialog.open) {
      dialog.showModal();
    } else if (!drawerOpen && dialog.open) {
      dialog.close();
    }
  }, [drawerOpen]);

  return (
    <main className={`ge-api${collapsed ? ' collapsed' : ''}`}>
      <aside className="api-sidebar" id="api-sidebar" ref={sidebar}>
        {renderNavigation(() => onDrawerChange(false))}
      </aside>
      <DocsSidebarCollapse
        label={
          collapsed
            ? (t.expandSidebar ?? t.menu)
            : (t.collapseSidebar ?? t.menu)
        }
        expanded={!collapsed}
        controlsId="api-sidebar"
        className="docs-sidebar-collapse-region--api"
        onToggle={onToggleCollapsed}
      />
      <div className="api-content-layout">
        <header className="api-toolbar">
          {toolbar}
          <button
            type="button"
            className="api-mobile-menu icon-action"
            aria-label={t.menu}
            onClick={() => onDrawerChange(true)}
          >
            <Icon name="menu" />
          </button>
        </header>
        <div ref={scrollRef} className="api-scroll docs-scroll-area">
          {children}
        </div>
      </div>
      <BackToTopButton label={t.top} scrollRef={scrollRef} />
      <dialog
        ref={drawerRef}
        className="api-drawer"
        aria-label={t.api}
        onCancel={event => {
          event.preventDefault();
          onDrawerChange(false);
        }}
        onClick={event => {
          if (event.target === event.currentTarget) {
            onDrawerChange(false);
          }
        }}
      >
        <header>
          <strong>{t.api}</strong>
          <button
            type="button"
            className="icon-action"
            aria-label={t.close}
            onClick={() => onDrawerChange(false)}
          >
            <Icon name="close" />
          </button>
        </header>
        {renderNavigation(() => onDrawerChange(false))}
      </dialog>
    </main>
  );
}
