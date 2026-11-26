import { builtInLocales, matchLocale, normalizeLocale } from './registry';
import type { LocaleDefinition } from './registry';
import en from './en.json' with { type: 'json' };
import zhCN from './zh-CN.json' with { type: 'json' };
import zhTW from './zh-TW.json' with { type: 'json' };
import ja from './ja.json' with { type: 'json' };
import ko from './ko.json' with { type: 'json' };
import de from './de.json' with { type: 'json' };
import pt from './pt.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import fr from './fr.json' with { type: 'json' };
import tr from './tr.json' with { type: 'json' };
import ar from './ar.json' with { type: 'json' };
import ru from './ru.json' with { type: 'json' };
import uk from './uk.json' with { type: 'json' };
import th from './th.json' with { type: 'json' };

export type CommonSiteMessageKey = keyof typeof en;
export type CommonSiteMessages = Record<CommonSiteMessageKey, string>;

export interface DocsI18nOptions {
  localeDefinitions?: Record<string, LocaleDefinition>;
  commonMessages?: Record<string, Partial<CommonSiteMessages>>;
}

export const commonMessages = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
  ko,
  de,
  pt,
  es,
  fr,
  tr,
  ar,
  ru,
  uk,
  th,
} satisfies Record<typeof builtInLocales[number], CommonSiteMessages>;

export function getCommonMessages(locale: string, options: DocsI18nOptions = {}): CommonSiteMessages {
  const id = normalizeLocale(locale);
  const builtin = matchLocale(id, builtInLocales);

  return { ...(builtin === undefined ? commonMessages.en : commonMessages[builtin]), ...options.commonMessages?.[id] };
}

export function getCommonMessageIssues(locale: string, options: DocsI18nOptions = {}): string[] {
  const builtin = matchLocale(locale, builtInLocales);
  const overrides = options.commonMessages?.[locale] ?? {};

  return Object.keys(commonMessages.en).filter(key =>
    builtin === undefined && !Object.hasOwn(overrides, key) ||
    (Object.hasOwn(overrides, key) && String(overrides[key as CommonSiteMessageKey]).trim() === ''),
  ).map(key => `${locale}/${key}`);
}

export function createMessageCatalog<
  const TLocale extends string,
  TProductMessages extends Record<string, Record<string, string>> = Record<never, never>,
>(locales: readonly TLocale[], productMessages: TProductMessages = {} as TProductMessages, options: DocsI18nOptions = {}) {
  const configuredLocales = [...locales];
  const keys = new Set(Object.values(productMessages).flatMap(messages => Object.keys(messages))
    .filter(key => !Object.hasOwn(commonMessages.en, key)));

  for (const locale of locales) {
    normalizeLocale(locale);
    for (const key of keys) {
      if (typeof productMessages[locale]?.[key] !== 'string' || productMessages[locale]?.[key]?.trim() === '') {
        throw new Error(`Every configured locale must have product messages: ${locale}/${key}`);
      }
    }
  }
  type Product = keyof TProductMessages extends never ? Record<never, never> : TProductMessages[keyof TProductMessages];

  return {
    locales: configuredLocales,
    isLocale: (value: unknown): value is TLocale => typeof value === 'string' && configuredLocales.includes(value as TLocale),
    messages: (locale: TLocale): CommonSiteMessages & Product => {
      if (!configuredLocales.includes(locale)) {
        throw new Error(`Unconfigured message locale: ${locale}`);
      }

      return { ...getCommonMessages(locale, options), ...productMessages[locale] };
    },
  };
}
