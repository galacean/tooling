import { createPreferenceStorage } from '../preferences';

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
  if (isSupportedLocale(storedLocale, locales)) {
    return storedLocale;
  }

  for (const language of browserLanguages) {
    const normalized = language.replace(/_/gu, '-').toLowerCase();
    const exactMatch = locales.find(
      locale => locale.toLowerCase() === normalized,
    );

    if (exactMatch !== undefined) {
      return exactMatch;
    }

    const primaryLanguage = normalized.split('-')[0];
    const languageMatch = locales.find(
      locale => locale.toLowerCase().split('-')[0] === primaryLanguage,
    );

    if (languageMatch !== undefined) {
      return languageMatch;
    }
  }

  return defaultLocale;
}

export function createBrowserLocalePreference<T extends string>(
  locales: readonly T[],
  defaultLocale: T,
  namespace: string,
): () => T {
  const preferences = createPreferenceStorage(namespace);

  return () => {
    const languages =
      navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];

    return resolvePreferredLocale(
      locales,
      defaultLocale,
      preferences.read('locale').value,
      languages,
    );
  };
}
