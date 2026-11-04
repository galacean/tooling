import type { ReactNode } from 'react';
import { Icon, MarkdownContent } from '../shared';

export interface APICommentProps {
  text: string | undefined;
  locale: string;
  sourceLocale: string | undefined;
  getLocaleLabel: (locale: string) => string;
  messages: {
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
  if (text === undefined) {
    return empty ? (
      <p className="api-no-description">{t.noDescription}</p>
    ) : null;
  }

  return (
    <div className="api-comment">
      <MarkdownContent
        text={text}
        copyLabel={t.copy}
        copied={t.copied}
        copyFailed={t.copyFailed}
        {...(resolveLink === undefined ? {} : { resolveLink })}
      />
      {sourceLocale !== undefined && sourceLocale !== locale && (
        <small className="original-locale">
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

export function APIDescriptionList({
  items,
  className = '',
}: {
  items: APIDescriptionItem[];
  className?: string;
}) {
  return (
    <dl className={`api-descriptions ${className}`}>
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
      <APIDescriptionList className="api-signature-details" items={items} />
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
            className="api-source icon-action"
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
