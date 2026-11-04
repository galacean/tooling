import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { groupManualPages, ManualPage } from '../../src/components/manual/manual-page';
import type { ManualPageProps } from '../../src/components/manual/manual-page';
import { Icon } from '../../src/components/shared/icon';
import { MarkdownContent } from '../../src/components/shared/markdown';
import { SelectControl } from '../../src/components/shared/select-control';

describe('shared MarkdownContent', () => {
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

  it('resolves internal links and inserts consumer content after the first paragraph', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(MarkdownContent, {
          text: 'First paragraph.\n\n[Manual](manual/start/)\n\nSecond paragraph.',
          resolveLink: url => `/en/${url}`,
          afterFirstParagraph: createElement('aside', null, 'Consumer content'),
        }),
      ),
    );

    expect(html.indexOf('<p>First paragraph.</p>')).toBeLessThan(
      html.indexOf('<aside>Consumer content</aside>'),
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
