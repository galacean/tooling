import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { DocsI18nOptions } from '../i18n/messages';

const DocsI18nContext = createContext<DocsI18nOptions>({});

export function DocsI18nProvider({ options = {}, children }: { options?: DocsI18nOptions; children: ReactNode }) {
  return <DocsI18nContext.Provider value={options}>{children}</DocsI18nContext.Provider>;
}

export function useDocsI18n(): DocsI18nOptions {
  return useContext(DocsI18nContext);
}
