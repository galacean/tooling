import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { APIReflectionDetail } from '../../src/components/api/api-reflection-detail';
import type { APIReflectionDetailMessages } from '../../src/components/api/api-reflection-detail';

const messages: APIReflectionDetailMessages = {
  contents: 'Contents',
  overview: 'Overview',
  signature: 'Signature',
  description: 'Description',
  parameters: 'Parameters',
  returns: 'Returns',
  extends: 'Extends',
  implements: 'Implements',
  generics: 'Generics',
  deprecated: 'Deprecated',
};

const reflection = {
  id: 1,
  name: 'Widget',
  kind: 256,
  variant: 'declaration',
  flags: {},
  comment: { summary: [{ kind: 'text', text: 'Widget summary' }] },
  typeParameters: [
    {
      id: 2,
      name: 'T',
      kind: 131072,
      variant: 'typeParam',
      flags: {},
      type: { type: 'intrinsic', name: 'string' },
    },
  ],
  children: [
    {
      id: 3,
      name: 'value',
      kind: 1024,
      variant: 'declaration',
      flags: { isOptional: true },
      type: { type: 'intrinsic', name: 'string' },
    },
    {
      id: 4,
      name: 'run',
      kind: 2048,
      variant: 'declaration',
      flags: {},
      signatures: [
        {
          id: 5,
          name: 'run',
          kind: 4096,
          variant: 'signature',
          flags: {},
          parameters: [
            {
              id: 6,
              name: 'input',
              kind: 32768,
              variant: 'param',
              flags: {},
              type: { type: 'intrinsic', name: 'string' },
            },
          ],
          type: { type: 'intrinsic', name: 'boolean' },
        },
      ],
    },
  ],
};

describe('APIReflectionDetail', () => {
  it('renders generic declarations, signatures, grouped members, and consumer-provided content', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <APIReflectionDetail
          reflection={reflection}
          showInherited={false}
          messages={messages}
          getGroupLabel={kind => (kind === 1024 ? 'Properties' : 'Methods')}
          renderKind={(kind, compact) => (
            <span>{compact ? `K${kind}` : `Kind ${kind}`}</span>
          )}
          renderSource={() => <small>Source</small>}
          renderComment={(target, options) => {
            const comment = target.comment;
            const summary = comment?.summary?.map(part => part.text).join('');

            return <p>{options?.field ?? summary ?? 'Summary'}</p>;
          }}
          renderType={type => <code>{JSON.stringify(type)}</code>}
          renderTokens={tokens => (
            <code>{tokens.map(token => token.text).join('')}</code>
          )}
          isExternalInherited={() => false}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain(
      '<h1>Widget<code>&lt;T extends string&gt;</code></h1>',
    );
    expect(markup).toContain('Widget summary');
    expect(markup).toContain('Properties');
    expect(markup).toContain('<h3>value?</h3>');
    expect(markup).toContain('Methods');
    expect(markup).toContain('run(input: string): boolean');
    expect(markup).toContain('Source');
    expect(markup).toContain('href="/#value"');
  });
});
