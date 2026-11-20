import { isSupportedLocale } from './locales';

import english from './en.json' with { type: 'json' };
import chinese from './zh-CN.json' with { type: 'json' };

const checkedChinese = chinese satisfies Record<keyof typeof english, string>;

export const commonMessages = { en: english, 'zh-CN': checkedChinese };
export type CommonSiteMessageKey = keyof typeof english;
export type CommonSiteMessages = Record<CommonSiteMessageKey, string>;

export function createMessageCatalog<
  TConfiguredLocale extends string,
  TProductMessages extends Record<string, Record<string, string>>,
>(locales: readonly TConfiguredLocale[], productMessages: TProductMessages) {
  type TLocale = TConfiguredLocale & keyof typeof commonMessages & keyof TProductMessages;

  const configuredLocales = locales.filter((locale): locale is TLocale =>
    Object.hasOwn(commonMessages, locale) && Object.hasOwn(productMessages, locale),
  );

  if (configuredLocales.length !== locales.length) {
    throw new Error('Every configured locale must have common and product messages');
  }

  return {
    locales: configuredLocales,
    isLocale: (value: unknown): value is TLocale =>
      isSupportedLocale(value, configuredLocales),
    messages: (locale: TLocale) => ({
      ...commonMessages[locale],
      ...productMessages[locale],
    }),
  };
}
