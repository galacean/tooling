import { normalizeLocale } from '@galacean/docs-site';

export interface TranslationSelectionOptions {
  sourceLocale?: string;
  targetLocales?: string[] | 'all';
  dryRun?: boolean;
  packages?: string[];
  collections?: string[];
  pages?: string[];
}

export function parseTranslationSelection(values: string[]): { options: TranslationSelectionOptions; remaining: string[] } {
  const options: TranslationSelectionOptions = {};
  const remaining: string[] = [];
  const seen = new Set<string>();
  const names: Record<string, keyof TranslationSelectionOptions> = {
    '--source-locale': 'sourceLocale', '--target-locales': 'targetLocales', '--locale': 'targetLocales',
    '--packages': 'packages', '--collections': 'collections', '--pages': 'pages', '--dry-run': 'dryRun',
  };

  for (let i = 0; i < values.length; i++) {
    const argument = values[i]!;
    const key = names[argument];

    if (key === undefined) {
      remaining.push(argument);
      continue;
    }
    if (seen.has(key)) {
      throw new Error(`Duplicate or conflicting translation option: ${argument}`);
    }
    seen.add(key);
    if (key === 'dryRun') {
      options.dryRun = true;
      continue;
    }
    const value = values[++i];

    if (value === undefined || value.startsWith('--') || value.trim() === '') {
      throw new Error(`Provide a value after ${argument}`);
    }
    if (key === 'sourceLocale') {
      options.sourceLocale = value === 'all' ? value : normalizeLocale(value);
    } else {
      const selected = value.split(',');

      if (selected.some(item => item.trim() !== item || item === '') || new Set(selected).size !== selected.length) {
        throw new Error(`Empty or duplicate selection: ${argument}`);
      }
      if (key === 'targetLocales') {
        options.targetLocales = value === 'all' ? 'all' : selected.map(normalizeLocale);
      } else {
        options[key] = selected;
      }
    }
  }

  return { options, remaining };
}

export function validateSourceSelection(available: readonly string[], selected?: string): void {
  if (selected !== undefined && selected !== 'all' && !available.includes(selected)) {
    throw new Error(`Source locale ${selected} is not available; actual sources: ${available.join(', ')}`);
  }
}

export function selectTargetLocales(locales: readonly string[], sourceLocale: string, options: TranslationSelectionOptions): string[] {
  const targets = options.targetLocales === undefined || options.targetLocales === 'all' ? [...locales] : options.targetLocales;

  if (targets.length === 0 || new Set(targets).size !== targets.length || targets.some(locale => !locales.includes(locale))) {
    throw new Error('Translation targets must be unique configured locales');
  }

  return targets.filter(locale => locale !== sourceLocale);
}
