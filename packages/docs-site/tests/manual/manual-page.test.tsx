// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ManualPage } from '../../src/components/manual/manual-page';
import type { ManualNavigationPage } from '../../src/components/manual/manual-page';

const messages = {
  home: 'Home',
  manual: 'Manual',
  manualIntro: 'Manual introduction',
  loading: 'Loading',
  loadError: 'Load failed',
  loadErrorDescription: 'Please retry',
  notFound: 'Not found',
  previous: 'Previous',
  next: 'Next',
  contents: 'Contents',
  mobileDirectory: 'Directory',
  lastUpdated: 'Updated',
  copy: 'Copy',
  copied: 'Copied',
  copyFailed: 'Copy failed',
};

const page = {
  text: '# Intro\n\n## First section\n\nText\n\n## Second section\n\nMore text',
  headings: [
    { title: 'Intro', level: 1 },
    { title: 'First section', level: 2 },
    { title: 'Second section', level: 2 },
  ],
};
const navigationPages: ManualNavigationPage[] = [
  { slug: 'intro', title: 'Intro', group: 'Getting Started' },
];
const loadOverview = async () => page;

function renderManualPage(
  onTitleChange?: (title: string) => void,
  pages: ManualNavigationPage[] = navigationPages,
  slugOverride?: string | null,
  onSidebarCollapsed?: (collapsed: boolean) => void,
  documentOverride: typeof page = page,
) {
  const slug = slugOverride === null ? undefined : (slugOverride ?? 'intro');

  render(
    <MemoryRouter initialEntries={[`/en/manual/${slug ?? ''}`]}>
      <ManualPage
        locale="en"
        slug={slug}
        {...(onTitleChange === undefined ? {} : { onTitleChange })}
        {...(onSidebarCollapsed === undefined ? {} : { onSidebarCollapsed })}
        messages={messages}
        sectionLabel="Manual"
        homeHref="/en/"
        getPageHref={slug => `/en/manual/${slug ?? ''}`}
        loadNavigation={async () => pages}
        loadOverview={async () => documentOverride}
        loadPage={async () => documentOverride}
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ManualPage navigation', () => {
  it('reports the selected page title to the manual shell', async () => {
    const onTitleChange = vi.fn();

    renderManualPage(onTitleChange);

    await waitFor(() => {
      expect(onTitleChange).toHaveBeenLastCalledWith('Intro');
    });
  });

  it('hides the expand-all outline action when there are no nested headings', async () => {
    renderManualPage(undefined, navigationPages, undefined, undefined, {
      text: '# Intro',
      headings: [{ title: 'Intro', level: 1 }],
    });

    await screen.findByRole('heading', { name: 'Intro' });
    const toc = document.querySelector<HTMLElement>('.manual-toc');

    expect(toc).not.toBeNull();
    expect(
      within(toc!).queryByRole('button', { name: 'Collapse all' }),
    ).toBeNull();
    expect(
      within(toc!).getByRole('button', { name: 'Hide outline' }),
    ).not.toBeNull();
  });

  it('collapses and expands the directory sidebar', async () => {
    const onSidebarCollapsed = vi.fn();

    renderManualPage(undefined, navigationPages, undefined, onSidebarCollapsed);

    const collapseButton = await screen.findByRole('button', {
      name: 'Collapse directory',
    });

    expect(collapseButton.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(collapseButton);

    const expandButton = screen.getByRole('button', {
      name: 'Expand directory',
    });

    expect(expandButton.getAttribute('aria-expanded')).toBe('false');
    expect(
      document
        .querySelector('.docs-layout')
        ?.classList.contains('sidebar-collapsed'),
    ).toBe(true);
    await waitFor(() => {
      expect(onSidebarCollapsed).toHaveBeenLastCalledWith(true);
    });

    fireEvent.click(expandButton);

    expect(
      document
        .querySelector('.docs-layout')
        ?.classList.contains('sidebar-collapsed'),
    ).toBe(false);
    await waitFor(() => {
      expect(onSidebarCollapsed).toHaveBeenLastCalledWith(false);
    });
  });

  it('scrolls the manual article to the top with the shared action', async () => {
    renderManualPage();
    await screen.findByRole('heading', { name: 'Intro' });
    const article = document.querySelector<HTMLElement>('.manual-article');
    const scrollTo = vi.fn();

    expect(article).not.toBeNull();
    Object.defineProperty(article, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to top' }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('hides the locate action on the manual overview', async () => {
    renderManualPage(undefined, navigationPages, null);

    await screen.findByRole('heading', { name: 'Intro' });
    await screen.findAllByRole('button', {
      name: 'Collapse menu Getting Started',
    });
    const sidebar = document.querySelector<HTMLElement>('.manual-sidebar');

    expect(sidebar).not.toBeNull();
    expect(
      within(sidebar!).queryByRole('button', { name: 'Locate current page' }),
    ).toBeNull();
    expect(
      within(sidebar!).getByRole('button', { name: 'Collapse all' }),
    ).not.toBeNull();
  });

  it('locates the current page without collapsing unrelated groups', async () => {
    renderManualPage(undefined, [
      { slug: 'intro', title: 'Intro', group: 'Getting Started' },
      { slug: 'reference', title: 'Reference entry', group: 'Reference' },
    ]);

    await screen.findAllByRole('button', {
      name: 'Collapse menu Getting Started',
    });
    const sidebar = document.querySelector<HTMLElement>('.manual-sidebar');

    expect(sidebar).not.toBeNull();
    const referenceToggle = await within(sidebar!).findByRole('button', {
      name: 'Collapse menu Reference',
    });

    fireEvent.click(
      within(sidebar!).getByRole('button', { name: 'Locate current page' }),
    );

    expect(referenceToggle.getAttribute('aria-expanded')).toBe('true');
    expect(
      within(sidebar!).getByRole('link', { name: 'Reference entry' }),
    ).not.toBeNull();
  });

  it('keeps the previous article visible while the next page loads', async () => {
    const transitionPages = [
      { slug: 'intro', title: 'Intro', group: 'Getting Started' },
      { slug: 'details', title: 'Details', group: 'Getting Started' },
    ];
    let resolveNextPage: ((document: typeof page) => void) | undefined;
    const nextPage = new Promise<typeof page>(resolve => {
      resolveNextPage = resolve;
    });
    const loadPageForTransition = vi.fn((_locale: string, slug: string) =>
      slug === 'intro' ? Promise.resolve(page) : nextPage,
    );
    const onTitleChange = vi.fn();
    const renderAtSlug = (slug: string) => (
      <MemoryRouter initialEntries={['/en/manual/intro']}>
        <ManualPage
          locale="en"
          slug={slug}
          onTitleChange={onTitleChange}
          messages={messages}
          sectionLabel="Manual"
          homeHref="/en/"
          getPageHref={value => `/en/manual/${value ?? ''}`}
          loadNavigation={async () => transitionPages}
          loadOverview={loadOverview}
          loadPage={loadPageForTransition}
        />
      </MemoryRouter>
    );
    const view = render(renderAtSlug('intro'));

    expect(
      await screen.findByRole('heading', { name: 'Intro' }),
    ).not.toBeNull();
    expect(onTitleChange).toHaveBeenLastCalledWith('Intro');
    onTitleChange.mockClear();
    const sidebar = document.querySelector('.manual-sidebar');

    view.rerender(renderAtSlug('details'));
    await waitFor(() => {
      expect(loadPageForTransition).toHaveBeenLastCalledWith('en', 'details');
    });
    expect(screen.getByRole('heading', { name: 'Intro' })).not.toBeNull();
    expect(document.querySelector('.document-loading-inline')).toBeNull();
    expect(document.querySelector('.manual-sidebar')).toBe(sidebar);
    expect(
      document.querySelector('.manual-sidebar-nav a[aria-current="page"]')
        ?.textContent,
    ).toBe('Intro');
    expect(onTitleChange).not.toHaveBeenCalled();

    resolveNextPage?.({
      text: '# Details\n\nNext page content',
      headings: [{ title: 'Details', level: 1 }],
    });

    expect(
      await screen.findByRole('heading', { name: 'Details' }),
    ).not.toBeNull();
    await waitFor(() => {
      expect(
        document.querySelector('.manual-sidebar-nav a[aria-current="page"]')
          ?.textContent,
      ).toBe('Details');
      expect(onTitleChange).toHaveBeenLastCalledWith('Details');
    });
  });

  it('scrolls the article over a short outline and the outline when it overflows', async () => {
    renderManualPage();
    await screen.findByRole('heading', { name: 'Intro' });

    const article = document.querySelector<HTMLElement>('.manual-article');
    const toc = document.querySelector<HTMLElement>('.manual-toc');
    const articleScrollBy = vi.fn();
    const tocScrollBy = vi.fn();

    expect(article).not.toBeNull();
    expect(toc).not.toBeNull();
    toc!.style.overflowY = 'auto';
    Object.defineProperty(article!, 'scrollBy', {
      configurable: true,
      value: articleScrollBy,
    });
    Object.defineProperty(toc!, 'scrollBy', {
      configurable: true,
      value: tocScrollBy,
    });
    Object.defineProperty(toc!, 'scrollHeight', {
      configurable: true,
      value: 100,
    });
    Object.defineProperty(toc!, 'clientHeight', {
      configurable: true,
      value: 400,
    });

    const articleWheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    });

    toc!.dispatchEvent(articleWheel);

    expect(articleScrollBy).toHaveBeenCalledWith({
      top: 120,
      behavior: 'auto',
    });

    Object.defineProperty(toc!, 'scrollHeight', {
      configurable: true,
      value: 500,
    });
    const tocWheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    });

    toc!.dispatchEvent(tocWheel);

    expect(articleScrollBy).toHaveBeenCalledTimes(1);
    expect(tocScrollBy).not.toHaveBeenCalled();
  });

  it('renders nested pages with a Remix disclosure icon and depth-based indent', async () => {
    renderManualPage(undefined, [
      { slug: 'intro', title: 'Intro', group: 'Getting Started' },
      {
        slug: 'details',
        title: 'Details',
        group: 'Getting Started',
        parent: 'intro',
      },
    ]);
    await screen.findAllByRole('button', {
      name: 'Collapse menu Getting Started',
    });
    const sidebar = document.querySelector<HTMLElement>('.manual-sidebar');

    expect(sidebar).not.toBeNull();
    const expandPage = await within(sidebar!).findByRole('button', {
      name: 'Expand menu Intro',
    });

    expect(
      expandPage.querySelector('[data-icon="chevronDown"]'),
    ).not.toBeNull();
    fireEvent.click(expandPage);
    const nestedPage = await within(sidebar!).findByRole('link', {
      name: 'Details',
    });
    const nestedRow = nestedPage.closest<HTMLElement>('.manual-nav-row');

    expect(nestedRow?.style.getPropertyValue('--manual-nav-depth')).toBe(
      '24px',
    );
    expect(nestedPage.querySelector('.manual-nav-item-indent')).not.toBeNull();
  });

  it('toggles groups and follows the current heading while scrolling', async () => {
    renderManualPage();

    await screen.findAllByRole('button', {
      name: 'Collapse menu Getting Started',
    });
    const sidebar = document.querySelector<HTMLElement>('.manual-sidebar');

    expect(sidebar).not.toBeNull();
    const navigation = sidebar!.querySelector<HTMLElement>(
      '.manual-sidebar-nav',
    );
    const sidebarLabel = sidebar!.querySelector<HTMLElement>(
      '.manual-sidebar-label',
    );
    const sidebarTitle = sidebarLabel?.querySelector(
      '.manual-sidebar-label-title',
    );

    expect(navigation).not.toBeNull();
    expect(sidebarLabel?.tagName).toBe('DIV');
    expect(sidebarTitle?.tagName).toBe('DIV');
    expect(
      sidebarTitle?.querySelector('[data-icon="directory"]'),
    ).not.toBeNull();
    expect(sidebar!.querySelector('.manual-sidebar-home')).toBeNull();
    expect(
      navigation!.contains(sidebar!.querySelector('.manual-sidebar-label')),
    ).toBe(false);
    const groupToggle = await within(sidebar!).findByRole('button', {
      name: 'Collapse menu Getting Started',
    });

    expect(
      groupToggle.querySelector('[data-icon="chevronDown"]'),
    ).not.toBeNull();
    expect(groupToggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(groupToggle);
    expect(groupToggle.getAttribute('aria-expanded')).toBe('false');
    expect(
      within(sidebar!).queryByRole('link', { name: 'Intro', current: 'page' }),
    ).toBeNull();
    fireEvent.click(groupToggle);
    expect(
      await within(sidebar!).findByRole('link', {
        name: 'Intro',
        current: 'page',
      }),
    ).not.toBeNull();

    await screen.findByRole('heading', { name: 'Second section' });
    const firstSection = document.getElementById('first-section');
    const secondSection = document.getElementById('second-section');

    expect(firstSection).not.toBeNull();
    expect(secondSection).not.toBeNull();
    const firstSectionBounds = vi
      .spyOn(firstSection!, 'getBoundingClientRect')
      .mockReturnValue({ top: 100 } as DOMRect);

    vi.spyOn(secondSection!, 'getBoundingClientRect').mockReturnValue({
      top: 400,
    } as DOMRect);

    const article = document.querySelector<HTMLElement>('.manual-article');

    expect(article).not.toBeNull();
    vi.useFakeTimers();
    article!.dispatchEvent(new Event('scroll'));
    document.querySelector('.docs-layout')?.dispatchEvent(new Event('scroll'));

    expect(firstSectionBounds).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });
    expect(firstSectionBounds).toHaveBeenCalledTimes(1);
    vi.useRealTimers();

    await waitFor(() => {
      expect(
        screen
          .getByRole('link', { name: 'First section' })
          .getAttribute('aria-current'),
      ).toBe('location');
    });
    expect(
      screen
        .getByRole('link', { name: 'Second section' })
        .getAttribute('aria-current'),
    ).toBeNull();
  });

  it('collapses, locates, and restores the navigation and outline', async () => {
    renderManualPage();

    await screen.findAllByRole('button', {
      name: 'Collapse menu Getting Started',
    });
    const sidebar = document.querySelector<HTMLElement>('.manual-sidebar');
    const toc = document.querySelector<HTMLElement>('.manual-toc');

    expect(sidebar).not.toBeNull();
    expect(toc).not.toBeNull();

    const collapseGroup = within(sidebar!).getByRole('button', {
      name: 'Collapse menu Getting Started',
    });

    fireEvent.click(
      within(sidebar!).getByRole('button', { name: 'Collapse all' }),
    );

    expect(collapseGroup.getAttribute('aria-expanded')).toBe('false');
    expect(
      within(sidebar!).queryByRole('link', { name: 'Intro', current: 'page' }),
    ).toBeNull();
    const expandAll = within(sidebar!).getByRole('button', {
      name: 'Expand all',
    });

    expect(expandAll.querySelector('[data-icon="expand"]')).not.toBeNull();
    fireEvent.click(expandAll);
    expect(collapseGroup.getAttribute('aria-expanded')).toBe('true');
    expect(
      within(sidebar!).getByRole('button', { name: 'Collapse all' }),
    ).not.toBeNull();
    fireEvent.click(
      within(sidebar!).getByRole('button', { name: 'Collapse all' }),
    );
    expect(collapseGroup.getAttribute('aria-expanded')).toBe('false');

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);

      return 1;
    });
    fireEvent.click(
      within(sidebar!).getByRole('button', { name: 'Locate current page' }),
    );

    expect(
      await within(sidebar!).findByRole('link', {
        name: 'Intro',
        current: 'page',
      }),
    ).not.toBeNull();
    expect(
      within(sidebar!)
        .getByRole('button', { name: 'Collapse menu Getting Started' })
        .getAttribute('aria-expanded'),
    ).toBe('true');

    fireEvent.click(within(toc!).getByRole('button', { name: 'Collapse all' }));
    expect(
      within(toc!).queryByRole('link', { name: 'First section' }),
    ).toBeNull();
    const expandOutline = within(toc!).getByRole('button', {
      name: 'Expand all',
    });

    expect(expandOutline.querySelector('[data-icon="expand"]')).not.toBeNull();
    fireEvent.click(expandOutline);
    expect(
      await within(toc!).findByRole('link', { name: 'First section' }),
    ).not.toBeNull();
    fireEvent.click(within(toc!).getByRole('button', { name: 'Collapse all' }));
    expect(
      within(toc!).queryByRole('link', { name: 'First section' }),
    ).toBeNull();
    fireEvent.click(within(toc!).getByRole('button', { name: 'Hide outline' }));
    expect(toc!.classList.contains('is-hidden')).toBe(true);
    expect(toc!.classList.contains('is-hover-suppressed')).toBe(true);
    expect(toc!.querySelector('.manual-toc-panel')).not.toBeNull();
    expect(
      toc!.querySelector('.manual-toc-row[data-depth="0"]'),
    ).not.toBeNull();
    fireEvent.pointerLeave(toc!);
    expect(toc!.classList.contains('is-hover-suppressed')).toBe(false);

    const showOutline = within(toc!).getByRole('button', {
      name: 'Show outline',
    });

    expect(showOutline.querySelector('[data-icon="eye"]')).not.toBeNull();
    fireEvent.click(showOutline);
    expect(toc!.classList.contains('is-hidden')).toBe(false);
    fireEvent.click(within(toc!).getByRole('button', { name: 'Expand Intro' }));

    expect(
      await within(toc!).findByRole('link', { name: 'First section' }),
    ).not.toBeNull();
  });
});
