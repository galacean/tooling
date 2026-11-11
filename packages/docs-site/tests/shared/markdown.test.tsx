// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  buildManualNavigationGroups,
  groupManualPages,
  ManualPage,
} from '../../src/components/manual/manual-page';
import type { ManualPageProps } from '../../src/components/manual/manual-page';
import { Icon } from '../../src/components/shared/icon';
import {
  HTMLDocumentContent,
  MarkdownContent,
} from '../../src/components/shared/markdown';
import { SelectControl } from '../../src/components/shared/select-control';

describe('shared MarkdownContent', () => {
  it('preserves Yuque HTML document structure for rendering', () => {
    const html =
      '<article><h2 id="intro">Intro</h2><table><tbody><tr><td>Cell</td></tr></tbody></table></article>';
    const markup = renderToStaticMarkup(
      createElement(HTMLDocumentContent, { html }),
    );

    expect(markup).toContain(html);
    expect(markup).toContain('class="markdown-content"');
  });

  it('renders shared icon glyphs with decorative and accessible semantics', () => {
    const decorative = renderToStaticMarkup(
      createElement(Icon, { name: 'search' }),
    );
    const named = renderToStaticMarkup(
      createElement(Icon, { name: 'close', 'aria-label': 'Close' }),
    );

    expect(decorative).toContain('viewBox="0 0 24 24"');
    expect(decorative).toContain('aria-hidden="true"');
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Close"');
  });

  it('creates stable heading anchors from formatted heading text', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(MarkdownContent, {
          text: '## `extractLottieFromZip(zipData)`\n\n[Jump](#extractlottiefromzipzipdata)',
        }),
      ),
    );

    expect(html).toContain(
      '<h2 id="extractlottiefromzipzipdata"><code>extractLottieFromZip(zipData)</code></h2>',
    );
    expect(html).toContain('<a href="/#extractlottiefromzipzipdata">Jump</a>');
  });

  it('resolves internal links and inserts consumer content after the first heading', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(MarkdownContent, {
          text: '# Getting started\n\nFirst paragraph.\n\n[Manual](manual/start/)\n\nSecond paragraph.',
          resolveLink: url => `/en/${url}`,
          afterFirstHeading: createElement('aside', null, 'Consumer content'),
        }),
      ),
    );

    expect(
      html.indexOf('<h1 id="getting-started">Getting started</h1>'),
    ).toBeLessThan(html.indexOf('<aside>Consumer content</aside>'));
    expect(html.indexOf('<aside>Consumer content</aside>')).toBeLessThan(
      html.indexOf('<p>First paragraph.</p>'),
    );
    expect(html).toContain('href="/en/manual/start/"');
    expect(html).toContain('>Manual</a>');
    expect(html).toContain('<p>Second paragraph.</p>');
  });

  it('exposes an accessible listbox trigger without opening the menu by default', () => {
    const html = renderToStaticMarkup(
      createElement(SelectControl, {
        ariaLabel: 'Language',
        value: 'en',
        options: [
          { value: 'en', label: 'English' },
          { value: 'zh-CN', label: '简体中文' },
        ],
        onChange: () => undefined,
      }),
    );

    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('English');
    expect(html).not.toContain('role="option"');
  });
});

describe('shared ManualPage', () => {
  it('groups localized pages in first-appearance order without mutating navigation', () => {
    const pages = [
      { slug: 'first', title: 'First', group: 'Basics' },
      { slug: 'second', title: 'Second', group: 'Advanced' },
      { slug: 'third', title: 'Third', group: 'Basics' },
    ];

    expect(groupManualPages(pages)).toEqual([
      { title: 'Basics', pages: [pages[0], pages[2]] },
      { title: 'Advanced', pages: [pages[1]] },
    ]);
    expect(pages.map(page => page.slug)).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(groupManualPages([])).toEqual([]);
  });

  it('nests child pages under their parent and leaves missing parents at the root', () => {
    const pages = [
      { slug: 'parent', title: 'Parent', group: 'Basics' },
      { slug: 'child', title: 'Child', group: 'Basics', parent: 'parent' },
      { slug: 'orphan', title: 'Orphan', group: 'Basics', parent: 'missing' },
    ];

    expect(buildManualNavigationGroups(pages)).toMatchObject([
      {
        title: 'Basics',
        pages: [
          { slug: 'parent', children: [{ slug: 'child' }] },
          { slug: 'orphan', children: [] },
        ],
      },
    ]);
  });

  it('keeps pages in parent cycles at the group root while nesting their descendants', () => {
    const groups = buildManualNavigationGroups([
      { slug: 'first', title: 'First', group: 'Basics', parent: 'second' },
      { slug: 'second', title: 'Second', group: 'Basics', parent: 'first' },
      { slug: 'child', title: 'Child', group: 'Basics', parent: 'first' },
      { slug: 'self', title: 'Self', group: 'Basics', parent: 'self' },
    ]);

    expect(groups).toMatchObject([
      {
        title: 'Basics',
        pages: [
          { slug: 'first', children: [{ slug: 'child' }] },
          { slug: 'second', children: [] },
          { slug: 'self', children: [] },
        ],
      },
    ]);
  });

  it('creates nested collapsible groups from hierarchical group paths', () => {
    const groups = buildManualNavigationGroups([
      { slug: 'overview', title: 'Overview', group: 'Basics' },
      { slug: 'detail', title: 'Detail', group: 'Basics / Advanced' },
    ]);

    expect(groups).toMatchObject([
      {
        title: 'Basics',
        pages: [{ slug: 'overview' }],
        groups: [{ title: 'Advanced', pages: [{ slug: 'detail' }] }],
      },
    ]);
  });

  it('lets a parent page expand and collapse its child links', async () => {
    const props: ManualPageProps = {
      locale: 'zh-CN',
      slug: 'parent',
      sectionLabel: 'GUIDE',
      homeHref: '/',
      getPageHref: slug => `/guide/${slug ?? ''}`,
      loadNavigation: async () => [
        { slug: 'parent', title: 'Parent', group: 'Basics' },
        { slug: 'child', title: 'Child', group: 'Basics', parent: 'parent' },
      ],
      loadOverview: async () => ({ text: '', headings: [] }),
      loadPage: async () => ({
        text: '# Parent',
        lastModified: '2025-08-27T18:44:00.000Z',
        headings: [
          { title: 'Overview', level: 2 },
          { title: 'Nested', level: 3 },
          { title: 'Detail', level: 4 },
          { title: 'Next', level: 2 },
        ],
      }),
      messages: {
        home: 'Home',
        manual: 'Guide',
        manualIntro: 'Introduction',
        loading: 'Loading',
        loadError: 'Unavailable',
        loadErrorDescription: 'Please retry',
        notFound: 'Missing page',
        previous: 'Previous',
        next: 'Next',
        contents: '大纲',
        mobileDirectory: 'Pages',
        lastUpdated: 'Last updated',
        copy: 'Copy',
        copied: 'Copied',
        copyFailed: 'Copy failed',
      },
    };
    const { container } = render(
      <MemoryRouter initialEntries={['/guide/parent']}>
        <ManualPage {...props} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(container.querySelector('.manual-sidebar')).not.toBeNull();
    });
    await waitFor(() => {
      expect(container.querySelector('.manual-article-updated')).not.toBeNull();
    });
    const updated = container.querySelector('.manual-article-updated');

    expect(updated?.querySelector('time')?.textContent).toBe(
      '2025-08-27 18:44',
    );
    expect(updated?.querySelector('svg')).not.toBeNull();
    expect(
      updated?.nextElementSibling?.classList.contains('manual-pagination'),
    ).toBe(true);
    const sidebar = within(
      container.querySelector('.manual-sidebar') as HTMLElement,
    );
    const groupHeading = sidebar.getByRole('button', {
      name: '收起菜单 Basics',
    });

    fireEvent.click(sidebar.getByRole('button', { name: '全部折叠' }));
    expect(sidebar.queryByRole('link', { name: 'Parent' })).toBeNull();
    fireEvent.click(sidebar.getByRole('button', { name: '定位当前文档' }));
    expect(sidebar.getByRole('link', { name: 'Parent' })).not.toBeNull();
    fireEvent.click(groupHeading);
    expect(sidebar.queryByRole('link', { name: 'Parent' })).toBeNull();
    fireEvent.click(sidebar.getByRole('button', { name: '展开菜单 Basics' }));

    const toggle = await sidebar.findByRole('button', {
      name: '展开菜单 Parent',
    });

    expect(sidebar.getByRole('link', { name: 'Parent' })).not.toBeNull();
    expect(sidebar.queryByRole('link', { name: 'Child' })).toBeNull();
    fireEvent.click(toggle);
    expect(sidebar.getByRole('link', { name: 'Child' })).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(sidebar.queryByRole('link', { name: 'Child' })).toBeNull();

    const toc = within(container.querySelector('.manual-toc') as HTMLElement);
    const tocPanelToggle = toc.getByRole('button', { name: '展开 大纲' });

    expect(tocPanelToggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(tocPanelToggle);
    expect(tocPanelToggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(tocPanelToggle);
    expect(tocPanelToggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toc.getByRole('button', { name: '隐藏大纲' }));
    expect(container.querySelector('.docs-layout.no-toc')).not.toBeNull();
    fireEvent.click(toc.getByRole('button', { name: '展开大纲' }));
    expect(container.querySelector('.docs-layout.no-toc')).toBeNull();

    const tocToggle = await toc.findByRole('button', { name: '收起 Nested' });

    expect(toc.getByRole('link', { name: 'Detail' })).not.toBeNull();
    fireEvent.click(tocToggle);
    expect(toc.queryByRole('link', { name: 'Detail' })).toBeNull();
    expect(toc.getByRole('link', { name: 'Nested' })).not.toBeNull();
    fireEvent.click(tocToggle);
    expect(toc.getByRole('link', { name: 'Detail' })).not.toBeNull();
    fireEvent.click(toc.getByRole('button', { name: '全部折叠' }));
    expect(toc.queryByRole('link', { name: 'Detail' })).toBeNull();
  });

  it('renders the manual loading layout before consumer navigation is available', () => {
    const loadNavigation = vi.fn(async () => []);
    const props: ManualPageProps = {
      locale: 'fr',
      slug: 'introduction',
      sectionLabel: 'EXAMPLE GUIDE',
      homeHref: '/fr/',
      getPageHref: slug => `/fr/guide/${slug ?? ''}`,
      loadNavigation,
      loadOverview: async () => ({ text: '', headings: [] }),
      loadPage: async () => ({ text: '', headings: [] }),
      messages: {
        home: 'Home',
        manual: 'Guide',
        manualIntro: 'Introduction',
        loading: 'Loading',
        loadError: 'Unavailable',
        loadErrorDescription: 'Please retry',
        notFound: 'Missing page',
        previous: 'Previous',
        next: 'Next',
        contents: 'Contents',
        mobileDirectory: 'Pages',
        lastUpdated: 'Last updated',
        copy: 'Copy',
        copied: 'Copied',
        copyFailed: 'Copy failed',
      },
    };
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ManualPage {...props} />
      </MemoryRouter>,
    );

    expect(markup).toContain('document-loading');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status">Loading</p>');
    expect(markup).not.toContain('Design Bridge');
    expect(loadNavigation).not.toHaveBeenCalled();
  });
});
