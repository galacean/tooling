import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DocumentLoading } from '../../src/components/shared/document-loading';

describe('shared DocumentLoading', () => {
  it.each(['manual', 'api'] as const)(
    'renders an accessible %s page skeleton',
    layout => {
      const markup = renderToStaticMarkup(
        createElement(DocumentLoading, { layout, label: 'Loading' }),
      );

      expect(markup).toContain('<main');
      expect(markup).toContain(`document-loading-${layout}`);
      expect(markup).toContain('aria-busy="true"');
      expect(markup).toContain(
        '<p class="document-loading-label" role="status">Loading</p>',
      );
      expect(markup).toContain('document-loading-sidebar" aria-hidden="true"');
      expect(markup).toContain('document-loading-content" aria-hidden="true"');
      expect(markup).not.toMatch(/<(a|button)\b/u);
    },
  );

  it('renders inline content without a nested main or loading label', () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentLoading, { label: 'Loading' }),
    );

    expect(markup).toContain('document-loading-inline');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain(
      '<p class="document-loading-label" role="status">Loading</p>',
    );
    expect(markup).not.toContain('<main');
    expect(markup).not.toContain('document-loading-sidebar');
  });
});
