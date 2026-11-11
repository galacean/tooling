// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '../../src/components/shared/icon';

describe('Icon', () => {
  it('renders Remix line icons through the shared component', () => {
    const { container } = render(<Icon name="search" />);
    const icon = container.querySelector('svg');

    expect(icon?.getAttribute('data-icon')).toBe('search');
    expect(icon?.getAttribute('fill')).toBe('currentColor');
    expect(icon?.getAttribute('stroke')).toBeNull();
    expect(icon?.getAttribute('viewBox')).toBe('0 0 24 24');
  });
});
