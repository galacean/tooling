import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Icon } from '../shared';

export interface APIReferenceLayoutProps {
  messages: { api: string; menu: string; close: string; top: string };
  sidebarHeading: ReactNode;
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
  sidebarHeading,
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
      <aside className="api-sidebar" ref={sidebar}>
        <div className="api-sidebar-heading">{sidebarHeading}</div>
        {renderNavigation(() => onDrawerChange(false))}
      </aside>
      <button
        type="button"
        aria-label={t.menu}
        className="api-collapse icon-action"
        onClick={onToggleCollapsed}
      >
        <Icon name="menu" />
      </button>
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
        <div ref={scrollRef} className="api-scroll">
          {children}
        </div>
        <button
          type="button"
          className="api-back-top icon-action"
          aria-label={t.top}
          onClick={() =>
            scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
          }
        >
          <Icon name="top" />
        </button>
      </div>
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
