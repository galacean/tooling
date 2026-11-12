import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { buildReflectionIndex } from '@galacean/docs-site';
import { APITypeDocDetail } from '../../src/components/api/api-typedoc-detail';
import type {
  APITypeDocContext,
  APITypeDocDetailMessages,
} from '../../src/components/api/api-typedoc-detail';

type Reflection = {
  id: number;
  name: string;
  kind: number;
  variant: string;
  flags: Record<string, boolean>;
  [key: string]: unknown;
};

const messages: APITypeDocDetailMessages = {
  overview: 'Overview',
  signature: 'Signature',
  description: 'Description',
  parameters: 'Parameters',
  returns: 'Returns',
  extends: 'Extends',
  implements: 'Implements',
  generics: 'Generics',
  deprecated: 'Deprecated',
  definition: 'View definition',
  sourceType: 'Type origin',
  source: 'Source',
  noDescription: 'No description',
  original: 'Original',
  copy: 'Copy',
  copied: 'Copied',
  copyFailed: 'Copy failed',
};

const project = {
  id: 1,
  name: 'Fixture',
  kind: 1,
  variant: 'project',
  flags: {},
  children: [
    {
      id: 2,
      name: '@example/alpha',
      kind: 2,
      variant: 'declaration',
      flags: {},
      children: [
        {
          id: 3,
          name: 'convert',
          kind: 64,
          variant: 'declaration',
          flags: {},
          signatures: [
            {
              id: 4,
              name: 'convert',
              kind: 4096,
              variant: 'signature',
              flags: {},
              parameters: [],
              type: {
                type: 'reference',
                name: 'Widget',
                target: 6,
                package: '@example/beta',
              },
            },
          ],
        },
      ],
    },
    {
      id: 5,
      name: '@example/beta',
      kind: 2,
      variant: 'declaration',
      flags: {},
      children: [
        {
          id: 6,
          name: 'Widget',
          kind: 256,
          variant: 'declaration',
          flags: {},
          comment: {
            summary: [{ kind: 'text', text: 'A widget definition.' }],
          },
        },
      ],
    },
  ],
};
const packages = [
  {
    key: 'alpha',
    name: '@example/alpha',
    version: '1.0.0',
    entries: [
      {
        key: 'root',
        symbols: [{ name: 'convert', id: 3, kind: 64 }],
      },
    ],
  },
  {
    key: 'beta',
    name: '@example/beta',
    version: '2.0.0',
    entries: [
      {
        key: 'root',
        symbols: [{ name: 'Widget', id: 6, kind: 256 }],
      },
    ],
  },
];

const index = buildReflectionIndex<Reflection>(
  project,
  packages,
  (locale, packageKey, version, symbol, _entry, hash) =>
    `/${locale}/api/${packageKey}/${version}/${symbol}/${hash}`,
);
const reflection = index.byId.get(3);

if (reflection === undefined) {
  throw new Error('Missing function reflection');
}
const context: APITypeDocContext<typeof project, Reflection, 'en'> = {
  project,
  index,
  locale: 'en',
  version: 'current',
  commit: 'fixture',
};

describe('APITypeDocDetail', () => {
  it('renders external public declaration stubs as package links', () => {
    const externalProject = {
      id: 1,
      name: 'Fixture',
      kind: 1,
      variant: 'project',
      flags: {},
      children: [
        {
          id: 9,
          name: '@example/alpha',
          kind: 2,
          variant: 'declaration',
          flags: {},
          children: [
            {
              id: 10,
              name: 'ExternalShape',
              kind: 128,
              variant: 'declaration',
              flags: { isExternal: true },
              externalUrl: 'https://www.npmjs.com/package/@example/shape',
            },
            {
              id: 11,
              name: 'makeShape',
              kind: 64,
              variant: 'declaration',
              flags: {},
              signatures: [
                {
                  id: 12,
                  name: 'makeShape',
                  kind: 4096,
                  variant: 'signature',
                  flags: {},
                  parameters: [],
                  type: {
                    type: 'reference',
                    name: 'ExternalShape',
                    target: 10,
                    package: '@example/shape',
                    externalUrl: 'https://www.npmjs.com/package/@example/shape',
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const externalPackages = [
      {
        key: 'alpha',
        name: '@example/alpha',
        version: '1.0.0',
        entries: [
          {
            key: 'root',
            symbols: [
              { name: 'ExternalShape', id: 10, kind: 128 },
              { name: 'makeShape', id: 11, kind: 64 },
            ],
          },
        ],
      },
    ];
    const externalIndex = buildReflectionIndex<Reflection>(
      externalProject,
      externalPackages,
      (_locale, packageKey, version, symbol) =>
        `/${packageKey}/${version}/${symbol}`,
    );
    const externalReflection = externalIndex.byId.get(10);

    if (externalReflection === undefined) {
      throw new Error('Missing external declaration stub');
    }
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        {},
        createElement(APITypeDocDetail, {
          reflection: externalReflection,
          context: {
            ...context,
            project: externalProject,
            index: externalIndex,
          },
          showInherited: false,
          messages,
          isLocale: (value: unknown): value is 'en' => value === 'en',
          getLocaleLabel: () => 'English',
          getGroupLabel: kind => String(kind),
          getRepositoryFileURL: (revision, filePath = '') =>
            `https://example.test/blob/${revision}/${filePath}`,
        }),
      ),
    );

    expect(html).toContain(
      'href="https://www.npmjs.com/package/@example/shape"',
    );
    expect(html).toContain('ExternalShape');

    const makeShape = externalIndex.byId.get(11);

    if (makeShape === undefined) {
      throw new Error('Missing function using an external type');
    }
    const signatureHTML = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        {},
        createElement(APITypeDocDetail, {
          reflection: makeShape,
          context: {
            ...context,
            project: externalProject,
            index: externalIndex,
          },
          showInherited: false,
          messages,
          isLocale: (value: unknown): value is 'en' => value === 'en',
          getLocaleLabel: () => 'English',
          getGroupLabel: kind => String(kind),
          getRepositoryFileURL: (revision, filePath = '') =>
            `https://example.test/blob/${revision}/${filePath}`,
        }),
      ),
    );

    expect(signatureHTML).toContain(
      'href="https://www.npmjs.com/package/@example/shape"',
    );
  });

  it('resolves cross-package references inside signature tokens', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        {},
        createElement(APITypeDocDetail, {
          reflection,
          context,
          showInherited: false,
          messages,
          isLocale: (value: unknown): value is 'en' => value === 'en',
          getLocaleLabel: () => 'English',
          getGroupLabel: kind => String(kind),
          getRepositoryFileURL: (revision, filePath = '') =>
            `https://example.test/blob/${revision}/${filePath}`,
        }),
      ),
    );

    expect(html).toContain('href="/en/api/beta/2.0.0/Widget/"');
    expect(html).toContain('A widget definition.');
  });
});
