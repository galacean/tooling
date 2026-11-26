import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HTMLDocumentContent, MarkdownContent } from '../../src/components/shared/markdown';

describe('document image policy before browser insertion', () => {
  it.each(['markdown', 'html'])('includes no-referrer in the initial %s markup without a browser DOM', format => {
    const src = 'https://cdn.nlark.com/yuque/image.png';
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        {format === 'markdown'
          ? <MarkdownContent text={`![Preview](${src})`} />
          : <HTMLDocumentContent html={`<p><img src="${src}" alt="Preview"></p>`} />}
      </MemoryRouter>,
    );
    const images = markup.match(/<img\b[^>]*>/gu);

    expect(images).toHaveLength(1);
    expect(images![0]).toMatch(/referrerpolicy="no-referrer"/iu);
    expect(images![0]).toContain(`src="${src}"`);
  });

  it('only changes actual image tags and keeps other HTML verbatim', () => {
    const before = [
      '<!-- <img src="comment.png"> -->',
      '<script>const example = \'<img src="script.png">\';</script>',
      '<style>p::before { content: \'<img src="style.png">\'; }</style>',
      '<textarea><img src="textarea.png"></textarea>',
      '<p data-example=\'<img src="attribute.png">\'>&lt;img src="code.png"&gt;</p>',
    ].join('');
    const image = '<img src="/real.png?x=1&amp;y=2" alt="Real > image" />';
    const markup = renderToStaticMarkup(<HTMLDocumentContent html={before + image} />);

    expect(markup).toContain(before);
    expect(markup).toContain(image.replace('<img', '<img referrerpolicy="no-referrer"'));
  });
});
