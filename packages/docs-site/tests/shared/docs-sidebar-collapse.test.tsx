// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsSidebarCollapse } from '../../src/components/shared/docs-sidebar-collapse';

const sidebarWidthProperty = '--site-doc-sidebar-width';

function dispatchPointerEvent(
  element: Element,
  type: string,
  init: MouseEventInit & { pointerId: number },
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });

  Object.defineProperty(event, 'pointerId', { value: init.pointerId });
  fireEvent(element, event);
}

describe('shared DocsSidebarCollapse', () => {
  let sidebar: HTMLElement;

  beforeEach(() => {
    sessionStorage.clear();
    document.documentElement.style.removeProperty(sidebarWidthProperty);
    document.documentElement.removeAttribute('data-sidebar-resizing');
    document.body.style.userSelect = '';
    sidebar = document.createElement('aside');
    sidebar.id = 'docs-sidebar';
    vi.spyOn(sidebar, 'getBoundingClientRect').mockImplementation(() => {
      const savedWidth = Number.parseFloat(
        document.documentElement.style.getPropertyValue(sidebarWidthProperty),
      );

      return { width: savedWidth || 300 } as DOMRect;
    });
    document.body.append(sidebar);
  });

  afterEach(() => {
    cleanup();
    sidebar.remove();
    document.documentElement.style.removeProperty(sidebarWidthProperty);
    document.documentElement.removeAttribute('data-sidebar-resizing');
    sessionStorage.clear();
  });

  const renderControl = () =>
    render(
      <DocsSidebarCollapse
        label="Toggle sidebar"
        expanded
        controlsId="docs-sidebar"
        onToggle={() => undefined}
      />,
    );

  it('resizes by pointer and clamps to the reference width range', () => {
    renderControl();
    const separator = screen.getByRole('separator');

    dispatchPointerEvent(separator, 'pointerdown', {
      pointerId: 1,
      button: 0,
      clientX: 100,
    });
    dispatchPointerEvent(separator, 'pointermove', {
      pointerId: 1,
      clientX: 1000,
    });
    expect(document.documentElement.style.getPropertyValue(sidebarWidthProperty))
      .toBe('480px');
    dispatchPointerEvent(separator, 'pointerup', { pointerId: 1 });
    expect(sessionStorage.getItem('docs-site-sidebar-width')).toBe('480');

    dispatchPointerEvent(separator, 'pointerdown', {
      pointerId: 2,
      button: 0,
      clientX: 1000,
    });
    dispatchPointerEvent(separator, 'pointermove', {
      pointerId: 2,
      clientX: 0,
    });
    expect(document.documentElement.style.getPropertyValue(sidebarWidthProperty))
      .toBe('259px');
    dispatchPointerEvent(separator, 'pointerup', { pointerId: 2 });
    expect(sessionStorage.getItem('docs-site-sidebar-width')).toBe('259');
  });

  it('expands a right-hand sidebar when the separator moves left', () => {
    const { container } = renderControl();

    container.dir = 'rtl';
    const separator = screen.getByRole('separator');

    dispatchPointerEvent(separator, 'pointerdown', { pointerId: 1, button: 0, clientX: 100 });
    dispatchPointerEvent(separator, 'pointermove', { pointerId: 1, clientX: 50 });
    dispatchPointerEvent(separator, 'pointerup', { pointerId: 1 });
    expect(separator.getAttribute('aria-valuenow')).toBe('350');
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(separator.getAttribute('aria-valuenow')).toBe('366');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator.getAttribute('aria-valuenow')).toBe('350');
  });

  it('supports keyboard resizing and persists the selected width', () => {
    renderControl();
    const separator = screen.getByRole('separator');

    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator.getAttribute('aria-valuenow')).toBe('480');
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(separator.getAttribute('aria-valuenow')).toBe('259');
    expect(sessionStorage.getItem('docs-site-sidebar-width')).toBe('259');
  });
});
