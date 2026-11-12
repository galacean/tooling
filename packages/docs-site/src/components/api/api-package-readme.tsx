import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DocumentError, DocumentLoading, MarkdownContent } from '../shared';

export interface APIPackageReadmeProps<TLocale extends string = string> {
  packageKey: string;
  locale: TLocale;
  loadReadme: (
    packageKey: string,
    locale: TLocale,
  ) => Promise<{ text: string; sourceLocale: string }>;
  loadErrorTitle: string;
  loadErrorDescription: string;
  loadingLabel: string;
  unknownHashLabel: string;
  copyLabel: string;
  copiedLabel: string;
  copyFailedLabel: string;
  resolveLink: (url: string) => string;
  resolveImage: (url: string) => string;
}

export function APIPackageReadme<TLocale extends string>({
  packageKey,
  locale,
  loadReadme,
  loadErrorTitle,
  loadErrorDescription,
  loadingLabel,
  unknownHashLabel,
  copyLabel,
  copiedLabel,
  copyFailedLabel,
  resolveLink,
  resolveImage,
}: APIPackageReadmeProps<TLocale>) {
  const location = useLocation();
  const navigate = useNavigate();
  const container = useRef<HTMLElement>(null);
  const [content, setContent] = useState<{
    text: string;
    sourceLocale: string;
  }>();
  const [error, setError] = useState(false);
  const [hashError, setHashError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setContent(undefined);
    setError(false);
    void loadReadme(packageKey, locale)
      .then(value => {
        if (!cancelled) {
          setContent(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [packageKey, locale, loadReadme]);
  useEffect(() => {
    if (content === undefined) {
      return;
    }
    setHashError(false);
    if (location.hash === '') {
      container.current?.closest('.api-scroll')?.scrollTo({ top: 0 });

      return;
    }
    let anchor: string;

    try {
      anchor = decodeURIComponent(location.hash.slice(1));
    } catch {
      setHashError(true);

      return;
    }
    const target = document.getElementById(anchor);

    if (target === null) {
      setHashError(true);
    } else {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [content, location.hash]);

  const handleAnchorClick = (event: MouseEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !(event.target instanceof Element)
    ) {
      return;
    }
    const link = event.target.closest('a[href]');
    const href = link?.getAttribute('href');

    if (href === undefined || href === null) {
      return;
    }
    const targetURL = new URL(
      href,
      `https://local.invalid${location.pathname}`,
    );

    if (
      targetURL.origin !== 'https://local.invalid' ||
      targetURL.pathname !== location.pathname ||
      targetURL.hash === ''
    ) {
      return;
    }
    event.preventDefault();
    void navigate(`${targetURL.pathname}${targetURL.search}${targetURL.hash}`);
    let anchor: string;

    try {
      anchor = decodeURIComponent(targetURL.hash.slice(1));
    } catch {
      setHashError(true);

      return;
    }
    const target = document.getElementById(anchor);

    if (target === null) {
      setHashError(true);

      return;
    }
    setHashError(false);
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  if (error) {
    return (
      <div className="api-package-readme">
        <DocumentError
          title={loadErrorTitle}
          description={loadErrorDescription}
        />
      </div>
    );
  }
  if (content === undefined) {
    return (
      <div className="api-package-readme">
        <DocumentLoading label={loadingLabel} />
      </div>
    );
  }

  return (
    <article
      className="api-package-readme"
      lang={content.sourceLocale}
      ref={container}
      onClickCapture={handleAnchorClick}
    >
      {hashError && (
        <div className="api-notice" role="status">
          {unknownHashLabel}: {location.hash}
        </div>
      )}
      <div className="docs-reading-content">
        <MarkdownContent
          text={content.text}
          copyLabel={copyLabel}
          copied={copiedLabel}
          copyFailed={copyFailedLabel}
          resolveLink={resolveLink}
          resolveImage={resolveImage}
        />
      </div>
    </article>
  );
}
