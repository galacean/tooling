import { createContext, useContext, useEffect } from 'react';
import type { CommonSiteMessages } from '../i18n/messages';
import { getCommonMessages } from '../i18n/messages';
import { useDocsI18n } from './i18n';

export interface PageEnvironment {
  locale: string;
  messages: Partial<CommonSiteMessages>;
  setTitle: (title: string) => void;
  setContentLocales: (locales: string[] | undefined) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const PageContext = createContext<PageEnvironment | undefined>(undefined);

export function usePageEnvironment(locale?: string, overrides?: Partial<CommonSiteMessages>) {
  const shell = useContext(PageContext);
  const language = locale ?? shell?.locale;
  const options = useDocsI18n();
  const setTitle = shell?.setTitle;
  const setContentLocales = shell?.setContentLocales;
  const setSidebarCollapsed = shell?.setSidebarCollapsed;

  useEffect(
    () => () => {
      setTitle?.('');
      setSidebarCollapsed?.(false);
    },
    [setTitle, setSidebarCollapsed],
  );
  useEffect(() => () => setContentLocales?.(undefined), [setContentLocales]);
  if (language === undefined) {
    throw new Error('Pass locale to the document page or SiteShell');
  }

  return {
    locale: language,
    messages: {
      ...getCommonMessages(language, options),
      ...(language === shell?.locale ? shell.messages : {}),
      ...overrides,
    },
    shell,
  };
}
