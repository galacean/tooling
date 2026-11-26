export interface ManualNavigationItem<TLocale extends string> {
  slug: string;
  contentLocales?: Readonly<Record<TLocale, string>>;
  translationStatus?: Readonly<Record<TLocale, string>>;
  title: Record<TLocale, string>;
  group: Record<TLocale, string>;
  parent?: string;
  format?: Readonly<Record<TLocale, ManualContentFormat>>;
  lastModified?: Readonly<Record<TLocale, string>>;
}

export type ManualContentFormat = 'markdown' | 'html';

export interface ManualHeading {
  title: string;
  level: number;
  id?: string;
}

export interface ManualPageDocument {
  contentLocale?: string;
  translationStatus?: string;
  text: string;
  headings: ManualHeading[];
  format?: ManualContentFormat;
  lastModified?: string;
}

export interface ManualNavigationPage {
  slug: string;
  alternateLocales?: string[];
  title: string;
  group: string;
  parent?: string;
}

export function manualAlternateLocales<TLocale extends string>(
  locales: readonly TLocale[],
  contentLocales: Readonly<Record<TLocale, string>>,
): TLocale[] {
  return locales.filter(locale => contentLocales[locale] === locale);
}
