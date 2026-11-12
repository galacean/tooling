import { Children, isValidElement, memo, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import { Link, useLocation } from 'react-router-dom';
import { CopyButton } from './copy-button';

hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);

export function headingId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/gu, '-');
}

function headingText(children: ReactNode): string {
  return Children.toArray(children)
    .map(child => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return headingText(child.props.children);
      }

      return '';
    })
    .join('');
}

function CodeBlock({
  children,
  copyLabel,
  copied,
  copyFailed,
}: {
  children: ReactNode;
  copyLabel: string;
  copied: string;
  copyFailed: string;
}) {
  const block = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const code = block.current?.querySelector<HTMLElement>('pre code');

    if (
      code !== null &&
      code !== undefined &&
      code.dataset['highlighted'] === undefined
    ) {
      hljs.highlightElement(code);
    }
  });

  return (
    <div className="code-block" ref={block}>
      <div className="code-head">
        <span>CODE</span>
        <CopyButton
          value={() => block.current?.querySelector('code')?.textContent ?? ''}
          label={copyLabel}
          success={copied}
          failure={copyFailed}
        />
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export function MarkdownContent({
  text,
  resolveLink,
  copyLabel = 'Copy',
  copied = 'Copied',
  copyFailed = 'Copy failed',
  afterFirstHeading,
  resolveImage,
}: {
  text: string;
  resolveLink?: (url: string) => string;
  copyLabel?: string;
  copied?: string;
  copyFailed?: string;
  afterFirstHeading?: ReactNode;
  resolveImage?: (url: string) => string;
}) {
  const location = useLocation();
  let headingInserted = false;

  return (
    <div className="markdown-content">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => {
            const heading = (
              <h1 id={headingId(headingText(children))}>{children}</h1>
            );

            if (afterFirstHeading === undefined || headingInserted) {
              return heading;
            }
            headingInserted = true;

            return (
              <>
                {heading}
                {afterFirstHeading}
              </>
            );
          },
          h2: ({ children }) => (
            <h2 id={headingId(headingText(children))}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 id={headingId(headingText(children))}>{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 id={headingId(headingText(children))}>{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 id={headingId(headingText(children))}>{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 id={headingId(headingText(children))}>{children}</h6>
          ),
          p: ({ children }) => <p>{children}</p>,
          table: ({ children }) => (
            <div className="markdown-table-scroll">
              <table>{children}</table>
            </div>
          ),
          th: ({ children, style }) => (
            <th style={style}>
              <div className="table-cell-content">{children}</div>
            </th>
          ),
          td: ({ children, style }) => (
            <td style={style}>
              <div className="table-cell-content">{children}</div>
            </td>
          ),
          pre: ({ children }) => (
            <CodeBlock
              copyLabel={copyLabel}
              copied={copied}
              copyFailed={copyFailed}
            >
              {children}
            </CodeBlock>
          ),
          a: ({ href, children }) => {
            const url = resolveLink?.(href ?? '') ?? href ?? '';

            if (url.startsWith('#')) {
              return (
                <a href={`${location.pathname}${location.search}${url}`}>
                  {children}
                </a>
              );
            }
            if (/^(?:https?:|mailto:|tel:|\/\/)/u.test(url)) {
              return (
                <a href={url} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            }
            const logical = new URL(
              url,
              `https://local.invalid${location.pathname}`,
            );

            return (
              <Link to={`${logical.pathname}${logical.search}${logical.hash}`}>
                {children}
              </Link>
            );
          },
          img: ({ src, alt, title }) => (
            <img
              src={resolveImage?.(src ?? '') ?? src}
              alt={alt ?? ''}
              title={title}
            />
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

const yuqueVideoMarker = '[**video**]';

function replaceYuqueVideoPlaceholders(root: HTMLElement) {
  root
    .querySelectorAll<HTMLDivElement>('div[data-video-src]')
    .forEach(placeholder => {
      const markerParagraph = placeholder.nextElementSibling;

      if (!(markerParagraph instanceof HTMLElement)) {
        return;
      }

      const anchor = markerParagraph.querySelector('a');

      if (anchor?.textContent !== yuqueVideoMarker) {
        return;
      }

      const video = document.createElement('video');

      video.src = anchor.href;
      video.controls = true;
      placeholder.replaceWith(video);
      markerParagraph.remove();
    });
}

export const HTMLDocumentContent = memo(function HTMLDocumentContent({
  html,
}: {
  html: string;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = container.current;

    if (root === null) {
      return;
    }
    root
      .querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
      .forEach(heading => {
        if (heading.id === '') {
          heading.id = headingId(heading.textContent ?? '');
        }
      });
    root.querySelectorAll<HTMLElement>('pre code').forEach(element => {
      if (element.dataset['highlighted'] === undefined) {
        hljs.highlightElement(element);
      }
    });
  }, [html]);

  return (
    <div
      ref={element => {
        container.current = element;
        if (element !== null) {
          replaceYuqueVideoPlaceholders(element);
        }
      }}
      className="markdown-content lake-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
