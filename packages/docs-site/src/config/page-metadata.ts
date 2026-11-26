import { getCommonMessages } from '../i18n/messages';
import type { DocsI18nOptions } from '../i18n/messages';
import { formatMessage } from '../i18n/format';

export function formatPageTitle(title: string, siteName: string): string {
  return title === '' || title === siteName ? siteName : `${title} | ${siteName}`;
}

export function formatPageDescription(locale: string, title: string, description?: string, i18n?: DocsI18nOptions): string {
  const fallback = formatMessage(getCommonMessages(locale, i18n).pageDescription, { title });

  const value = description?.trim();

  return [...(value === undefined || value === '' ? fallback : value).replace(/\s+/gu, ' ')]
    .slice(0, 160).join('');
}
