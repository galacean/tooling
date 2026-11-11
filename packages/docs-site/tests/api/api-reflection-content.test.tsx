// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  APIComment,
  APIDescriptionList,
  APISignaturePanel,
  APISourceLinks,
} from '../../src/components/api/api-reflection-content';
import { APIKindLabel } from '../../src/components/api/api-kind-label';
import {
  APIReflectionLayout,
  APIReflectionSections,
} from '../../src/components/api/api-reflection-layout';
import { APITokens } from '../../src/components/api/api-tokens';
import { APITypeReference } from '../../src/components/api/api-type-reference';

const messages = {
  noDescription: 'No description',
  original: 'Original',
  copy: 'Copy',
  copied: 'Copied',
  copyFailed: 'Copy failed',
};

describe('shared API reflection content', () => {
  it('renders shared kind labels and reference previews with consumer links', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <>
          <APIKindLabel kind={64} label="Functions" compact />
          <APITypeReference
            text="Result"
            target={{
              name: 'Result',
              href: '/en/api/example/current/Result/',
              definitionLabel: 'Definition',
              locale: 'zh-CN',
              signatures: [[{ text: 'Result(): string', role: 'name' }]],
              summary: 'A result type.',
              sourceLocale: 'en',
              originalLabel: 'Original',
              noDescription: 'None',
              members: [
                {
                  name: 'value',
                  href: '/en/api/example/current/Result/#value',
                },
              ],
            }}
          />
        </>
      </MemoryRouter>,
    );

    expect(markup).toContain(
      'class="kind-label kind-functions compact" title="Functions">F</span>',
    );
    expect(markup).toContain('aria-label="Result Definition"');
    expect(markup).toContain('href="/en/api/example/current/Result/"');
    expect(markup).toContain('A result type.');
    expect(markup).toContain('Original: en');
    expect(markup).toContain('href="/en/api/example/current/Result/#value"');
  });

  it('renders external and unresolved references without a preview panel', () => {
    const markup = renderToStaticMarkup(
      <>
        <APITypeReference text="URL" externalUrl="https://example.test/URL" />
        <APITypeReference
          text="External"
          externalUrl="https://example.test/External"
          target={{
            name: 'External',
            href: '/local/External/',
            definitionLabel: 'Definition',
            locale: 'en',
            signatures: [],
            summary: '',
            originalLabel: 'Original',
            noDescription: 'None',
            members: [],
          }}
        />
        <APITypeReference
          text="Missing"
          unresolvedTitle="External package Missing"
        />
      </>,
    );

    expect(markup).toContain('href="https://example.test/URL"');
    expect(markup).toContain('href="https://example.test/External"');
    expect(markup).toContain('title="External package Missing"');
    expect(markup).not.toContain('api-reference-content');
  });

  it('renders an open reference preview outside clipping containers', () => {
    const { container } = render(
      <MemoryRouter>
        <div className="api-scroll">
          <APITypeReference
            text="Result"
            target={{
              name: 'Result',
              href: '/api/Result/',
              definitionLabel: 'Definition',
              locale: 'en',
              signatures: [],
              summary: 'A result type.',
              originalLabel: 'Original',
              noDescription: 'None',
              members: [],
            }}
          />
        </div>
      </MemoryRouter>,
    );

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Result' }));

    const preview = screen.getByRole('group', { name: 'Result Definition' });

    expect(container.querySelector('.api-reference-content')).toBeNull();
    expect(preview.parentElement).toBe(document.body);
    expect(preview.classList.contains('is-open')).toBe(true);
  });

  it('passes distinct stable keys for repeated references', () => {
    const keys: React.Key[] = [];

    renderToStaticMarkup(
      <APITokens
        tokens={[
          { text: 'Node', role: 'type', reference: { name: 'Node' } },
          { text: 'Node', role: 'type', reference: { name: 'Node' } },
        ]}
        renderReference={(_reference, text, key) => {
          keys.push(key);

          return <span key={key}>{text}</span>;
        }}
      />,
    );

    expect(keys).toEqual([0, 1]);
  });

  it.each([undefined, 'fr', 'ja'])(
    'renders consumer links and source locale %s',
    sourceLocale => {
      const markup = renderToStaticMarkup(
        <MemoryRouter>
          <APIComment
            text="[Guide](./guide.md)"
            locale="fr"
            sourceLocale={sourceLocale}
            getLocaleLabel={locale => `Language ${locale}`}
            messages={messages}
            resolveLink={() => '/fr/manual/'}
          />
        </MemoryRouter>,
      );

      expect(markup).toContain('href="/fr/manual/"');
      if (sourceLocale === 'ja') {
        expect(markup).toContain('Original: Language ja');
      } else {
        expect(markup).not.toContain('original-locale');
      }
    },
  );

  it.each([false, true])('renders missing comments with empty=%s', empty => {
    const markup = renderToStaticMarkup(
      <APIComment
        text={undefined}
        locale="fr"
        sourceLocale={undefined}
        getLocaleLabel={locale => locale}
        messages={messages}
        empty={empty}
      />,
    );

    expect(markup).toBe(
      empty ? '<p class="api-no-description">No description</p>' : '',
    );
  });

  it('renders structured descriptions and only sources with supplied URLs', () => {
    const markup = renderToStaticMarkup(
      <APIDescriptionList
        className="example"
        items={[
          {
            key: 'source',
            label: <strong>Definition</strong>,
            content: (
              <APISourceLinks
                label="Source"
                sources={[
                  { fileName: 'src/hidden.ts', line: 1 },
                  {
                    fileName: 'src/core.ts',
                    line: 12,
                    url: 'https://example.test/core.ts#L12',
                  },
                ]}
              />
            ),
          },
        ]}
      />,
    );

    expect(markup).toContain('class="api-descriptions example"');
    expect(markup).toContain('<dt><strong>Definition</strong></dt>');
    expect(markup).toContain('href="https://example.test/core.ts#L12"');
    expect(markup).toContain('title="Source: src/core.ts:12"');
    expect(markup).toContain('target="_blank" rel="noreferrer"');
    expect(markup).not.toContain('hidden.ts');
  });

  it('wraps consumer signature rows in the shared signature panel', () => {
    const markup = renderToStaticMarkup(
      <APISignaturePanel
        items={[
          {
            key: 'signature',
            label: 'Signature',
            content: <code>convert(input)</code>,
          },
          { key: 'returns', label: 'Returns', content: <code>Result</code> },
        ]}
      />,
    );

    expect(markup).toContain(
      '<div class="api-signature-panel"><dl class="api-descriptions api-signature-details">',
    );
    expect(markup).toContain(
      '<dt>Signature</dt><dd><code>convert(input)</code></dd>',
    );
    expect(markup).toContain('<dt>Returns</dt><dd><code>Result</code></dd>');
  });

  it('renders the reflection body without an API outline', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <APIReflectionLayout>
          <article>TypeDoc reflection body</article>
        </APIReflectionLayout>
      </MemoryRouter>,
    );

    expect(markup).toContain('class="api-detail"');
    expect(markup).toContain('class="api-detail-main"');
    expect(markup).not.toContain('api-outline');
    expect(markup).toContain('<article>TypeDoc reflection body</article>');
  });

  it('renders grouped member cards while leaving each card body to the consumer', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <APIReflectionSections
          overviewLabel="Overview"
          reflectionLabel={<strong>Example</strong>}
          groups={[
            {
              id: 'api-group-methods',
              label: 'Methods',
              members: [
                {
                  id: '10',
                  name: 'run',
                  href: '#run',
                  kindLabel: <span>Method</span>,
                  children: <p>Run docs</p>,
                },
                {
                  id: '11',
                  name: 'stop',
                  href: '#stop',
                  kindLabel: <span>Method</span>,
                  optional: true,
                  headerContent: <small>Deprecated</small>,
                  children: <p>Stop docs</p>,
                },
              ],
            },
            { id: 'api-group-empty', label: 'Empty', members: [] },
          ]}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('id="api-overview"');
    expect(markup).toContain('<strong>Example</strong>');
    expect(markup).toContain('id="api-group-methods"');
    expect(markup).toContain('href="/#run"');
    expect(markup).toContain('id="stop"');
    expect(markup).toContain('<h3>stop?</h3>');
    expect(markup).toContain('<small>Deprecated</small>');
    expect(markup).toContain('<p>Run docs</p>');
    expect(markup).toContain('id="api-group-empty"');
  });
});
