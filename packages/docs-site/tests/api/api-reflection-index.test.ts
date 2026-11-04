import { describe, expect, it } from 'vitest';
import { buildReflectionIndex, isExternalInherited } from '@galacean/docs-site';

describe('shared API reflection index', () => {
  it('indexes nested members, resolves aliases and symbols, and delegates route construction', () => {
    const project = {
      id: 1,
      name: 'Project',
      variant: 'project',
      symbolIdMap: {
        20: {
          packageName: '@scope/pkg',
          packagePath: 'src/index.ts',
          qualifiedName: 'Root',
        },
      },
      children: [
        {
          id: 10,
          name: '@scope/pkg',
          variant: 'declaration',
          children: [
            {
              id: 20,
              name: 'Root',
              variant: 'declaration',
              children: [{ id: 21, name: 'member', variant: 'declaration' }],
            },
            { id: 30, name: 'Alias', variant: 'reference', target: 20 },
          ],
        },
      ],
    };
    const packages = [
      {
        key: 'pkg',
        name: '@scope/pkg',
        version: '1.2.3',
        entries: [
          { key: 'root', symbols: [{ name: 'Root', id: 20, kind: 256 }] },
        ],
      },
    ];
    const index = buildReflectionIndex(
      project,
      packages,
      (locale, key, version, symbol, entry, hash) =>
        `/${locale}/api/${key}/${version}/${symbol}/${hash}?entry=${entry}`,
    );

    expect(index.resolve(30)).toMatchObject({ id: 20, name: 'Root' });
    expect(
      index.resolve({
        packageName: '@scope/pkg',
        packagePath: 'src/index.ts',
        qualifiedName: 'Root',
      }),
    ).toMatchObject({ id: 20 });
    expect(index.parents.get(21)).toBe(20);
    expect(index.url('en', 'current', 21)).toBe(
      '/en/api/pkg/1.2.3/Root/member?entry=root',
    );
  });

  it('identifies inherited members whose targets are external to the snapshot', () => {
    const project = {
      id: 1,
      name: 'Project',
      variant: 'project',
      children: [
        {
          id: 20,
          name: 'Root',
          variant: 'declaration',
          children: [
            {
              id: 21,
              name: 'external',
              variant: 'declaration',
              inheritedFrom: { target: -1 },
            },
          ],
        },
      ],
    };
    const index = buildReflectionIndex(project, [], () => '/');
    const member = index.byId.get(21);

    expect(member).toBeDefined();
    if (member !== undefined) {
      expect(isExternalInherited(member, index)).toBe(true);
    }
  });
});
