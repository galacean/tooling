import { createPreferenceStorage } from '../preferences';
import { matchLocale } from './registry';

export function isSupportedLocale<T extends string>(
  value: unknown,
  locales: readonly T[],
): value is T {
  return typeof value === 'string' && locales.includes(value as T);
}

export function resolvePreferredLocale<T extends string>(
  locales: readonly T[],
  defaultLocale: T,
  storedLocale: unknown,
  browserLanguages: readonly string[],
): T {
  if (!isSupportedLocale(defaultLocale, locales)) {
    throw new Error('Default locale must be included in supported locales');
  }
  if (typeof storedLocale === 'string') {
    const stored = locales.find(locale => locale.toLowerCase() === storedLocale.replace(/_/gu, '-').toLowerCase());

    if (stored !== undefined) {
      return stored;
    }
  }

  for (const language of browserLanguages) {
    const languageMatch = matchLocale(language, locales, defaultLocale);

    if (languageMatch !== undefined) {
      return languageMatch;
    }
  }

  return defaultLocale;
}

export function createBrowserLocalePreference<T extends string>(
  locales: readonly T[],
  defaultLocale: T,
  storageKey: string,
): () => T {
  const preferences = createPreferenceStorage();

  return () => {
    const languages =
      navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];

    return resolvePreferredLocale(
      locales,
      defaultLocale,
      preferences.read(storageKey).value,
      languages,
    );
  };
}
