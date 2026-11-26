import { describe, expect, it } from 'vitest';
import {
  builtInLocales, commonMessages, createMessageCatalog, formatSymbolCount,
  getCommonMessageIssues, getCommonMessages, getLocaleDefinition, normalizeLocale,
} from '@galacean/docs-site';
import { resolvePreferredLocale } from '../../src/i18n/locales';
import { searchResults } from '../../src/search/query';

describe('multilingual contract', () => {
  it('ships complete dictionaries with identical placeholders for all 14 languages', () => {
    const keys = Object.keys(commonMessages.en).sort();
    const parameters = (value: string) => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu)].map(match => match[1]).sort();

    expect(builtInLocales).toHaveLength(14);
    for (const locale of builtInLocales) {
      const dictionary = commonMessages[locale];

      expect(Object.keys(dictionary).sort()).toEqual(keys);
      for (const key of keys as (keyof typeof dictionary)[]) {
        expect(dictionary[key].trim()).not.toBe('');
        expect(parameters(dictionary[key])).toEqual(parameters(commonMessages.en[key]));
      }
    }
  });

  it('does not need empty product dictionaries and permits custom language packs', () => {
    const catalog = createMessageCatalog(['ja', 'ar']);

    expect(catalog.messages('ja').manualIntro).toBe(commonMessages.ja.manualIntro);
    expect(catalog.messages('ar').home).toBe('الرئيسية');
    expect(getCommonMessages('zh-Hant').home).toBe('首頁');
    expect(getCommonMessageIssues('it')).toContain('it/home');
    const options = { commonMessages: { it: { ...commonMessages.en, home: 'Pagina iniziale' } } };

    expect(getCommonMessageIssues('it', options)).toEqual([]);
    expect(getCommonMessages('it', options).home).toBe('Pagina iniziale');
    expect(() => createMessageCatalog(['ja', 'ar'], { ja: { hero: '製品' } })).toThrow('ar/hero');
  });

  it('matches writing systems without confusing traditional and simplified Chinese', () => {
    const locales = ['zh-CN', 'zh-TW', 'en', 'pt'] as const;

    for (const input of ['zh-HK', 'zh-MO', 'zh-Hant', 'zh-TW']) {
      expect(resolvePreferredLocale(locales, 'en', null, [input])).toBe('zh-TW');
    }
    for (const input of ['zh-SG', 'zh-Hans']) {
      expect(resolvePreferredLocale(locales, 'en', null, [input])).toBe('zh-CN');
    }
    expect(resolvePreferredLocale(['zh-CN', 'en'], 'zh-CN', null, ['zh-Hant', 'en'])).toBe('en');
    expect(resolvePreferredLocale(locales, 'zh-TW', null, ['zh'])).toBe('zh-TW');
    expect(resolvePreferredLocale(locales, 'en', null, ['pt-BR'])).toBe('pt');
    expect(normalizeLocale('FR-ca')).toBe('fr-CA');
    expect(() => normalizeLocale('zh_CN')).toThrow();
    expect(() => normalizeLocale('en-u-ca-gregory')).toThrow();
  });

  it('formats plural counts and resolves explicit document directions', () => {
    expect(formatSymbolCount(1, 'ru')).toBe('1 символ');
    expect(formatSymbolCount(2, 'ru')).toBe('2 символа');
    expect(formatSymbolCount(5, 'uk')).toBe('5 символів');
    expect(getLocaleDefinition('ar').direction).toBe('rtl');
    expect(getLocaleDefinition('en').direction).toBe('ltr');
    expect(getLocaleDefinition('fa').direction).toBe('rtl');
  });

  it.each([
    ['fr', 'Méthode de création', 'methode'], ['de', 'Straße', 'strasse'],
    ['tr', 'İŞLEM oluştur', 'işlem'], ['ja', '描画エンジン', 'エンジン'],
    ['th', 'การทดสอบเอกสาร', 'ทดสอบ'], ['ar', 'البحث في الوثائق', 'الوثائق'],
    ['uk', 'Створення об’єктів', 'Створення'], ['ko', '문서 검색', '문서'],
  ])('finds %s text with Unicode-aware normalization', (locale, name, query) => {
    const item = { category: 'manual' as const, name, summary: '', keywords: name, sourceLocale: locale, url: `/${locale}/manual/guide/` };

    expect(searchResults([item], query, locale)).toEqual([item]);
  });
});
