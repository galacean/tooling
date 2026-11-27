import { useDocsI18n } from '../../providers/i18n';
import { getLocaleDefinition } from '../../i18n/registry';
import type { ReactNode } from 'react';
import { Icon, MarkdownContent } from '../shared';
import type { MarkdownMessages } from '../shared/markdown';

export interface APICommentProps {
  text: string | undefined;
  locale: string;
  sourceLocale: string | undefined;
  getLocaleLabel: (locale: string) => string;
  messages: Partial<MarkdownMessages> & {
    noDescription: string;
    original: string;
    copy: string;
    copied: string;
    copyFailed: string;
  };
  resolveLink?: (url: string) => string;
  empty?: boolean;
}

export function APIComment({
  text,
  locale,
  sourceLocale,
  getLocaleLabel,
  messages: t,
  resolveLink,
  empty = false,
}: APICommentProps) {
  const i18n = useDocsI18n();

  if (text === undefined) {
    return empty ? (
      <p className="api-no-description">{t.noDescription}</p>
    ) : null;
  }

  return (
    <div className="api-comment" lang={sourceLocale ?? locale} dir={getLocaleDefinition(sourceLocale ?? locale, i18n.localeDefinitions).direction}>
      <MarkdownContent
        messages={t}
        text={text}
        {...(resolveLink === undefined ? {} : { resolveLink })}
      />
      {sourceLocale !== undefined && sourceLocale !== locale && (
        <small className="api-original-locale">
          {t.original}: {getLocaleLabel(sourceLocale)}
        </small>
      )}
    </div>
  );
}

export interface APIDescriptionItem {
  key: string | number;
  label: ReactNode;
  content: ReactNode;
}

export function APIDescriptionList({ items }: { items: APIDescriptionItem[] }) {
  return (
    <dl className="api-descriptions">
      {items.map(item => (
        <div className="api-description-row" key={item.key}>
          <dt>{item.label}</dt>
          <dd>{item.content}</dd>
        </div>
      ))}
    </dl>
  );
}

export function APISignaturePanel({ items }: { items: APIDescriptionItem[] }) {
  return (
    <div className="api-signature-panel">
      <APIDescriptionList items={items} />
    </div>
  );
}

export interface APISourceReference {
  fileName: string;
  line: number;
  url?: string;
}

export function APISourceLinks({
  sources,
  label,
}: {
  sources: APISourceReference[];
  label: string;
}) {
  return (
    <>
      {sources
        .filter(source => source.url !== undefined)
        .map(source => (
          <a
            key={source.url}
            href={source.url}
            className="api-source docs-icon-action"
            target="_blank"
            rel="noreferrer"
            title={`${label}: ${source.fileName}:${source.line}`}
          >
            <Icon name="source" />
          </a>
        ))}
    </>
  );
}
