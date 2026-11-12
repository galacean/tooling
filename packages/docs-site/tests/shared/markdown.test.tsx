// @vitest-environment jsdom

import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
    expect(markup).toContain('class="markdown-content lake-content"');
  });

  it('keeps Lake table markup intact for CSS-driven scrolling', async () => {
    const { container } = render(
      createElement(HTMLDocumentContent, {
        html: '<table class="ne-table"><tbody><tr><td>Cell</td></tr></tbody></table>',
      }),
    );

    await waitFor(() => {
      expect(
        container.querySelector('.lake-content > table.ne-table'),
      ).not.toBeNull();
      expect(container.querySelector('.lake-table-scroll')).toBeNull();
      expect(
        container
          .querySelector('.lake-content > table.ne-table td')
          ?.getAttribute('width'),
      ).toBeNull();
    });
  });

  it('keeps native Markdown and Lake quote markers while sharing their content', async () => {
    const { container } = render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          'div',
          null,
          createElement(MarkdownContent, {
            text: '> Markdown quote\n>\n> - First item\n> - Second item',
          }),
          createElement(HTMLDocumentContent, {
            html: '<div class="ne-quote"><p class="ne-p">Lake quote</p><ul><li>First item</li><li>Second item</li></ul></div>',
          }),
        ),
      ),
    );

    await waitFor(() => {
      const markdownQuotes = container.querySelectorAll(
        '.markdown-content blockquote',
      );
      const lakeQuotes = container.querySelectorAll(
        '.markdown-content .ne-quote',
      );

      expect(markdownQuotes).toHaveLength(1);
      expect(lakeQuotes).toHaveLength(1);
      expect(markdownQuotes[0]?.textContent).toContain('Markdown quote');
      expect(markdownQuotes[0]?.querySelector('ul')).not.toBeNull();
      expect(lakeQuotes[0]?.textContent).toContain('Lake quote');
      expect(lakeQuotes[0]?.querySelector('ul')).not.toBeNull();
    });
  });

  it('preserves Lake table width attributes and spans', async () => {
    const { container } = render(
      createElement(HTMLDocumentContent, {
        html: [
          '<table class="ne-table" style="width: 677px">',
          '<tbody>',
          '<tr><td width="299" colspan="2">Merged</td><td width="127">A</td><td width="125">B</td><td width="126">C</td></tr>',
          '<tr><td width="210">Left</td><td width="89">Right</td><td width="127">A</td><td width="125">B</td><td width="126">C</td></tr>',
          '</tbody></table>',
        ].join(''),
      }),
    );

    await waitFor(() => {
      const table = container.querySelector<HTMLTableElement>(
        '.lake-content > table.ne-table',
      );
      const mergedCell =
        table?.querySelector<HTMLTableCellElement>('td[colspan="2"]');

      expect(table?.getAttribute('style')).toBe('width: 677px');
      expect(table?.querySelector(':scope > colgroup')).toBeNull();
      expect(mergedCell?.getAttribute('width')).toBe('299');
      expect(mergedCell?.textContent).toBe('Merged');
      expect(table?.querySelector('td > .table-cell-content')).toBeNull();
    });
  });

  it('leaves non-pixel Lake table widths to native table layout', async () => {
    const { container } = render(
      createElement(HTMLDocumentContent, {
        html: '<table class="ne-table" style="width: 100%"><tbody><tr><td width="50%">Left</td><td width="50%">Right</td></tr></tbody></table>',
      }),
    );

    await waitFor(() => {
      const table = container.querySelector<HTMLTableElement>(
        '.lake-content > table.ne-table',
      );

      expect(table?.querySelector(':scope > colgroup')).toBeNull();
      expect(table?.querySelector('td[width="50%"]')).not.toBeNull();
    });
  });

  it('renders Yuque video placeholders as native video controls', async () => {
    const { container } = render(
      createElement(HTMLDocumentContent, {
        html: [
          '<div class="ne-video" data-video-src="assets/stored-video.mp4">Video card</div>',
          '<p><a href="https://media.example.com/video.mp4">[**video**]</a></p>',
          '<div class="ne-video" data-video-src="assets/other-video.mp4">Other card</div>',
          '<p><a href="https://media.example.com/other.mp4">Open video link</a></p>',
        ].join(''),
      }),
    );

    await waitFor(() => {
      expect(container.querySelectorAll('video')).toHaveLength(1);
    });

    const video = container.querySelector('video');

    expect(video?.getAttribute('src')).toBe(
      'https://media.example.com/video.mp4',
    );
    expect(video?.controls).toBe(true);
    expect(
      container.querySelector('[data-video-src="assets/stored-video.mp4"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-video-src="assets/other-video.mp4"]'),
    ).not.toBeNull();
  });

  it('preserves video elements when unchanged HTML content rerenders', async () => {
    const html = [
      '<div class="ne-video" data-video-src="assets/stored-video.mp4">Video card</div>',
      '<p><a href="https://media.example.com/video.mp4">[**video**]</a></p>',
    ].join('');
    const { container, rerender } = render(
      createElement(HTMLDocumentContent, { html }),
    );

    await waitFor(() => {
      expect(container.querySelector('video')).not.toBeNull();
    });

    const video = container.querySelector('video');

    rerender(createElement(HTMLDocumentContent, { html }));

    expect(container.querySelector('video')).toBe(video);
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

  it('wraps Markdown tables in a horizontal overflow container', () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(MarkdownContent, {
          text: '| Name | Value |\n| --- | --- |\n| item | 1 |',
        }),
      ),
    );

    expect(markup).toContain('class="markdown-table-scroll"><table><thead>');
  });

  it('rehighlights fenced code blocks after a parent rerender', async () => {
    function RerenderableMarkdown() {
      const [revision, setRevision] = useState(0);

      return createElement(
        MemoryRouter,
        null,
        createElement(
          'div',
          null,
          createElement(
            'button',
            { onClick: () => setRevision(value => value + 1) },
            'Rerender',
          ),
          createElement('span', null, revision),
          createElement(MarkdownContent, {
            text: '```ts\nconst answer = 42;\n```',
          }),
        ),
      );
    }

    const { container } = render(createElement(RerenderableMarkdown));
    const findHighlightedCode = () => container.querySelector('pre code');

    await waitFor(() => {
      expect(
        findHighlightedCode()?.querySelector('.hljs-keyword'),
      ).not.toBeNull();
    });
    const previousCode = findHighlightedCode();

    fireEvent.click(screen.getByRole('button', { name: 'Rerender' }));

    await waitFor(() => {
      const code = findHighlightedCode();

      expect(code).not.toBe(previousCode);
      expect(code?.querySelector('.hljs-keyword')).not.toBeNull();
    });
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
    expect(pages.map(page => page.slug)).toEqual(['first', 'second', 'third']);
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
