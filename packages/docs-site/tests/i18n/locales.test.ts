import { describe, expect, it } from 'vitest';
import { isSupportedLocale, resolvePreferredLocale } from '@galacean/docs-site';

const locales = ['zh-CN', 'en', 'fr-CA'] as const;

describe('shared locale helpers', () => {
  it('validates against the consumer locale list', () => {
    expect(isSupportedLocale('en', locales)).toBe(true);
    expect(isSupportedLocale('fr', locales)).toBe(false);
    expect(isSupportedLocale(null, locales)).toBe(false);
  });

  it('prefers stored, exact browser, then primary-language locale before default', () => {
    expect(resolvePreferredLocale(locales, 'zh-CN', 'en', ['fr-CA'])).toBe(
      'en',
    );
    expect(
      resolvePreferredLocale(locales, 'zh-CN', null, ['fr-ca', 'en-US']),
    ).toBe('fr-CA');
    expect(resolvePreferredLocale(locales, 'zh-CN', null, ['fr-FR'])).toBe(
      'fr-CA',
    );
    expect(resolvePreferredLocale(locales, 'zh-CN', null, ['ja-JP'])).toBe(
      'zh-CN',
    );
    expect(() =>
      resolvePreferredLocale(locales, 'ja' as 'zh-CN', null, []),
    ).toThrow();
  });
});
