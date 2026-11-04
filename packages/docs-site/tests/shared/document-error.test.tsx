import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../src/components/shared/document-error';

describe('shared DocumentError', () => {
  it('renders consumer-provided copy in an alert region', () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentError, {
        title: 'Unable to load',
        description: 'This content is temporarily unavailable.',
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('<h1>Unable to load</h1>');
    expect(markup).toContain('<p>This content is temporarily unavailable.</p>');
  });

  it('supports a secondary heading beneath an overview title', () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentError, {
        title: 'Unable to load',
        description: 'Try again later.',
        heading: 'h2',
      }),
    );

    expect(markup).toContain('<h2>Unable to load</h2>');
    expect(markup).not.toContain('<h1>');
  });

  it('renders page errors in a full-page landmark', () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentError, {
        title: 'Unable to load',
        description: 'This content is temporarily unavailable.',
        layout: 'page',
      }),
    );

    expect(markup).toContain('<main class="document-error-page" role="alert">');
  });
});
