import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useDocsI18n } from './i18n';
import { getLocaleDefinition } from '../i18n/registry';

// undefined outside DocsRoot, null until its DOM element mounts.
const RootContext = createContext<HTMLDivElement | null | undefined>(undefined);

export interface DocsRootProps extends HTMLAttributes<HTMLDivElement> {
  theme?: 'light' | 'dark';
  layout?: 'embedded' | 'site';
}

/** Bounds documentation styles, theme tokens and layout to this element. */
export function DocsRoot({
  theme = 'light',
  layout = 'embedded',
  lang,
  className = '',
  ...props
}: DocsRootProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const { localeDefinitions } = useDocsI18n();

  return (
    <RootContext value={root}>
      <div
        {...props}
        ref={setRoot}
        className={`docs-root ${className}`}
        {...(lang === undefined ? {} : { lang })}
        {...(props.dir !== undefined
          ? { dir: props.dir }
          : lang === undefined
            ? {}
            : { dir: getLocaleDefinition(lang, localeDefinitions).direction })}
        data-theme={theme}
        data-layout={layout}
      />
    </RootContext>
  );
}

/** Gives a standalone page a style boundary while preserving an enclosing host theme. */
export function DocumentBoundary({ locale, children }: { locale: string; children: ReactNode }) {
  const enclosed = useContext(RootContext);

  return enclosed !== undefined ? children : <DocsRoot lang={locale}>{children}</DocsRoot>;
}

/** Place overlays inside the active theme, including when mounted on their own. */
export function DocsPortal({ children }: { children: ReactNode }) {
  const root = useContext(RootContext);

  if (typeof document === 'undefined') {
    return null;
  }
  if (root === undefined) {
    return createPortal(<DocsRoot style={{ display: 'contents' }}>{children}</DocsRoot>, document.body);
  }

  return root === null ? null : createPortal(children, root);
}
