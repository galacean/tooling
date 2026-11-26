export interface LocaleDefinition {
  label: string;
  direction: 'ltr' | 'rtl';
  script?: string;
}

export const localeDefinitions = {
  en: { label: 'English', direction: 'ltr' },
  'zh-CN': { label: '简体中文', direction: 'ltr', script: 'Hans' },
  'zh-TW': { label: '繁體中文', direction: 'ltr', script: 'Hant' },
  ja: { label: '日本語', direction: 'ltr' },
  ko: { label: '한국어', direction: 'ltr' },
  de: { label: 'Deutsch', direction: 'ltr' },
  pt: { label: 'Português', direction: 'ltr' },
  es: { label: 'Español', direction: 'ltr' },
  fr: { label: 'Français', direction: 'ltr' },
  tr: { label: 'Türkçe', direction: 'ltr' },
  ar: { label: 'العربية', direction: 'rtl' },
  ru: { label: 'Русский', direction: 'ltr' },
  uk: { label: 'Українська', direction: 'ltr' },
  th: { label: 'ไทย', direction: 'ltr' },
} as const satisfies Record<string, LocaleDefinition>;

export const builtInLocales = Object.keys(localeDefinitions) as (keyof typeof localeDefinitions)[];

export function normalizeLocale(value: string): string {
  const canonical = Intl.getCanonicalLocales(value)[0];

  if (canonical === undefined || !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u.test(canonical) ||
    new Intl.Locale(canonical).baseName !== canonical) {
    throw new Error(`Invalid content locale: ${value}`);
  }

  return canonical;
}

export function matchLocale<T extends string>(value: string, locales: readonly T[], preferred?: T): T | undefined {
  let requested: Intl.Locale;

  try {
    requested = new Intl.Locale(value.replace(/_/gu, '-'));
  } catch {
    return undefined;
  }
  const exact = locales.find(locale => locale.toLowerCase() === requested.baseName.toLowerCase());

  if (exact !== undefined) {
    return exact;
  }
  const candidates = locales.filter(locale => {
    const candidate = new Intl.Locale(locale);

    return candidate.language === requested.language &&
      candidate.maximize().script === requested.maximize().script;
  });
  const sameLanguageDefault = preferred !== undefined &&
    new Intl.Locale(preferred).language === requested.language;

  if (requested.script === undefined && requested.region === undefined && sameLanguageDefault) {
    return preferred;
  }
  const generic = candidates.find(locale => new Intl.Locale(locale).baseName === requested.language);

  return generic ?? (preferred !== undefined && candidates.includes(preferred) ? preferred :
    [...candidates].sort()[0]);
}

export function getLocaleDefinition(locale: string, overrides: Record<string, LocaleDefinition> = {}): LocaleDefinition {
  const id = normalizeLocale(locale);
  const builtin = matchLocale(id, builtInLocales);
  const script = new Intl.Locale(id).maximize().script;

  return overrides[id] ?? (builtin === undefined ? {
    label: id,
    direction: ['Arab', 'Hebr', 'Thaa', 'Nkoo', 'Adlm', 'Syrc'].includes(script ?? '') ? 'rtl' : 'ltr',
  } : localeDefinitions[builtin]);
}
