// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageViewer } from '../../src/components/shared/image-viewer';
import { HTMLDocumentContent } from '../../src/components/shared/markdown';

afterEach(cleanup);

describe('document image referrer policy', () => {
  it('overrides HTML image policies while preserving image and document attributes', () => {
    const { container, rerender } = render(<HTMLDocumentContent html={[
      '<article><h2 id="intro">Intro</h2>',
      '<picture><source srcset="/wide.png 2x">',
      '<IMG SRC="/first.png" REFERRERPOLICY=origin alt="First > image" width="640" loading="lazy" data-note="referrerpolicy=origin">',
      '</picture>',
      '<img src="/second.png" referrerpolicy referrerpolicy="unsafe-url">',
      '<table><tbody><tr><td>Cell</td></tr></tbody></table></article>',
    ].join('')} />);
    const images = container.querySelectorAll('img');

    expect([...images].map(image => image.getAttribute('referrerpolicy'))).toEqual([
      'no-referrer', 'no-referrer',
    ]);
    expect(images[0]?.getAttribute('src')).toBe('/first.png');
    expect(images[0]?.getAttribute('alt')).toBe('First > image');
    expect(images[0]?.getAttribute('width')).toBe('640');
    expect(images[0]?.getAttribute('loading')).toBe('lazy');
    expect(images[0]?.getAttribute('data-note')).toBe('referrerpolicy=origin');
    expect(container.querySelector('source')?.getAttribute('srcset')).toBe('/wide.png 2x');
    expect(container.querySelector('h2')?.id).toBe('intro');
    expect(container.querySelector('table td')?.textContent).toBe('Cell');

    rerender(<HTMLDocumentContent html='<img src="/updated.png" srcset="/updated-2x.png 2x">' />);
    const updated = container.querySelector('img');

    expect(updated?.getAttribute('src')).toBe('/updated.png');
    expect(updated?.getAttribute('srcset')).toBe('/updated-2x.png 2x');
    expect(updated?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('applies the policy to active and neighboring preview slides when switching images', () => {
    render(<ImageViewer
      images={['first', 'second', 'third'].map(name => ({
        src: `https://cdn.nlark.com/${name}.png`,
        alt: name,
        title: '',
        width: 640,
        height: 480,
      }))}
      initialIndex={0}
      onClose={() => undefined}
    />);

    const expectProtectedSlides = () => {
      const images = screen.getByRole('dialog').querySelectorAll('img');

      expect(images).toHaveLength(3);
      expect([...images].every(image => image.getAttribute('referrerpolicy') === 'no-referrer')).toBe(true);
    };

    expectProtectedSlides();
    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
    expect(screen.getByText('2 / 3')).toBeDefined();
    expectProtectedSlides();
    fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));
    expect(screen.getByText('1 / 3')).toBeDefined();
    expectProtectedSlides();
  });
});
