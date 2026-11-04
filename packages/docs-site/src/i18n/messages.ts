import { isSupportedLocale } from './locales';

import english from './en.json' with { type: 'json' };
import chinese from './zh-CN.json' with { type: 'json' };

const checkedChinese = chinese satisfies Record<keyof typeof english, string>;

export const commonMessages = { en: english, 'zh-CN': checkedChinese };
export type CommonSiteMessageKey = keyof typeof english;
export type CommonSiteMessages = Record<CommonSiteMessageKey, string>;

export function createMessageCatalog<
  TLocale extends keyof typeof commonMessages,
  TProductMessages extends Record<TLocale, Record<string, string>>,
>(locales: readonly TLocale[], productMessages: TProductMessages) {
  return {
    isLocale: (value: unknown): value is TLocale =>
      isSupportedLocale(value, locales),
    messages: (locale: TLocale) => ({
      ...commonMessages[locale],
      ...productMessages[locale],
    }),
  };
}
