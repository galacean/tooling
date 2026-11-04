import { describe, expect, it } from 'vitest';
import { resolveAPIReadmeLink } from '@galacean/docs-site';

const options = {
  locales: ['en', 'zh-CN'] as const,
  packageReadmes: {
    alpha: {
      en: 'packages/alpha/README.md',
      'zh-CN': 'packages/alpha/README-zh_CN.md',
    },
    beta: { en: 'packages/beta/README.md' },
  },
  getPackageHref: (locale: string, packageKey: string) =>
    `/${locale}/api/${packageKey}/`,
  getRepositoryURL: (pathname: string, search: string, hash: string) =>
    `https://github.com/example/repo/blob/main${pathname}${search}${hash}`,
};

describe('shared package README links', () => {
  it('maps configured package README files to locale-aware API pages', () => {
    expect(
      resolveAPIReadmeLink('alpha', '../beta/README.md#usage', options),
    ).toBe('/en/api/beta/#usage');
    expect(resolveAPIReadmeLink('alpha', './README-zh_CN.md', options)).toBe(
      '/zh-CN/api/alpha/',
    );
    expect(resolveAPIReadmeLink('alpha', './README.md', options)).toBe(
      '/en/api/alpha/',
    );
  });

  it('uses the injected repository resolver when a linked file is not a configured package README', () => {
    expect(resolveAPIReadmeLink('alpha', './src/index.ts', options)).toBe(
      'https://github.com/example/repo/blob/main/packages/alpha/src/index.ts',
    );
  });
});
