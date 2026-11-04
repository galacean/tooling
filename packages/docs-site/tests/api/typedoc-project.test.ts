import { describe, expect, it } from 'vitest';
import { indexReflections, isRecord, parseProject } from '@galacean/docs-site';

const project = {
  id: 1,
  name: 'fixture',
  kind: 1,
  variant: 'project',
  schemaVersion: '2.0',
  flags: {},
  symbolIdMap: {},
  files: { entries: {}, reflections: {} },
};

describe('TypeDoc project contracts', () => {
  it('accepts a valid project and rejects malformed reflection fields', () => {
    expect(parseProject(project)).toBe(project);
    expect(() => parseProject({ ...project, schemaVersion: '1.0' })).toThrow(
      /schema 2\.0/u,
    );
    expect(() =>
      parseProject({ ...project, children: [{ ...project, id: 'invalid' }] }),
    ).toThrow(/schema 2\.0/u);
  });

  it('recognizes plain records without accepting arrays or null', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });

  it('validates comment locales through the consumer-provided locale contract', () => {
    const withLocale = {
      ...project,
      children: [
        {
          id: 2,
          name: 'Root',
          kind: 256,
          variant: 'declaration',
          flags: {},
          comment: { summary: [], sourceLocale: 'fr' },
        },
      ],
    };

    expect(() =>
      parseProject(withLocale, locale => locale === 'en' || locale === 'zh-CN'),
    ).toThrow();
  });

  it('indexes nested TypeDoc reflections by ID', () => {
    const indexed = indexReflections({
      ...project,
      children: [
        {
          id: 2,
          variant: 'declaration',
          children: [{ id: 3, variant: 'signature' }],
        },
      ],
    });

    expect([...indexed.keys()]).toEqual([1, 2, 3]);
  });
});
