// @vitest-environment jsdom
import { DocsRouterAdapter } from '../../src/routing/react-router-adapter';
import { HTMLDocumentContent } from '../../src/components/shared/markdown';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { DocsLink } from '@galacean/docs-site';

afterEach(cleanup);

function Page() {
  const location = useLocation();

  return <><DocsLink to="/guide">Guide</DocsLink><output>{location.pathname}</output></>;
}

it('uses the site router to navigate document links', async () => {
  render(<MemoryRouter><DocsRouterAdapter><Page /></DocsRouterAdapter></MemoryRouter>);
  fireEvent.click(await screen.findByRole('link', { name: 'Guide' }));
  await waitFor(() => expect(screen.getByText('/guide')).toBeDefined());
});

it('publishes HTML links under the basename and navigates to their logical target', async () => {
  render(
    <MemoryRouter basename="/docs" initialEntries={['/docs/start']}>
      <DocsRouterAdapter>
        <HTMLDocumentContent
          html='<a href="../guide">Chapter</a><a href="chart.pdf">Chart</a>'
          resolveLink={url => url === 'chart.pdf' ? { resource: '/assets/chart.pdf' } : '/guide'}
        />
        <Page />
      </DocsRouterAdapter>
    </MemoryRouter>,
  );
  const chapter = screen.getByRole('link', { name: 'Chapter' });

  expect(chapter.getAttribute('href')).toBe('/docs/guide');
  expect(screen.getByRole('link', { name: 'Chart' }).getAttribute('href')).toBe('/assets/chart.pdf');
  fireEvent.click(chapter);
  await waitFor(() => expect(screen.getByText('/guide')).toBeDefined());
});
