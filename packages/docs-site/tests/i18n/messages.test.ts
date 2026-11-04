import { describe, expect, it } from 'vitest';
import { commonMessages, createMessageCatalog } from '@galacean/docs-site';

describe('shared site messages', () => {
  it('provides the same common message keys in English and Simplified Chinese', () => {
    expect(Object.keys(commonMessages.en).sort()).toEqual(
      Object.keys(commonMessages['zh-CN']).sort(),
    );
    expect(
      Object.values(commonMessages.en).every(value => value.length > 0),
    ).toBe(true);
    expect(
      Object.values(commonMessages['zh-CN']).every(value => value.length > 0),
    ).toBe(true);
  });

  it('merges product messages and validates only configured locales', () => {
    const catalog = createMessageCatalog(['en', 'zh-CN'] as const, {
      en: { hero: 'Home' },
      'zh-CN': { hero: '首页' },
    });

    expect(catalog.messages('en').hero).toBe('Home');
    expect(catalog.messages('en').search).toBe(commonMessages.en.search);
    expect(catalog.messages('zh-CN').hero).toBe('首页');
    expect(catalog.isLocale('zh-CN')).toBe(true);
    expect(catalog.isLocale('fr')).toBe(false);
  });
});
