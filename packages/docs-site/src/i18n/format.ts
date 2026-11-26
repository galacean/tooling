import { getCommonMessages } from './messages';
import type { CommonSiteMessages } from './messages';

export function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu, (token: string, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : token);
}

export function formatSymbolCount(count: number, locale: string, messages: CommonSiteMessages = getCommonMessages(locale)): string {
  const category = new Intl.PluralRules(locale).select(count);
  const key = `symbolCount_${category}` as keyof CommonSiteMessages;

  return formatMessage(messages[key] ?? messages.symbolCount_other, {
    count: new Intl.NumberFormat(locale).format(count),
  });
}
