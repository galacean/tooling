import type { ContentLink } from './content-link';
import {
  Children,
  isValidElement,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import plaintext from 'highlight.js/lib/languages/plaintext';
import xml from 'highlight.js/lib/languages/xml';
import {
  canNavigateLink,
  DocsLink as Link,
  isExternalHref,
  useDocsLocation as useLocation,
  useDocsNavigation,
} from '../../routing/navigation';
import { commonMessages } from '../../i18n/messages';
import { CopyButton } from './copy-button';
import { prepareDocumentHTML } from './html-image-referrer-policy';
import { ImageViewer } from './image-viewer';
import type { ImageViewerImage, ImageViewerMessages } from './image-viewer';

export type MarkdownMessages = ImageViewerMessages & Pick<
  typeof commonMessages.en, 'code' | 'copy' | 'copied' | 'copyFailed'
>;

const getContentImages = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('img')).filter(
    image => image.currentSrc !== '' || image.getAttribute('src') !== null,
  );

function useImageViewer(messages: ImageViewerMessages) {
  const [opened, setOpened] = useState<{
    images: ImageViewerImage[];
    initialIndex: number;
    returnFocusTo: () => HTMLImageElement | undefined;
  }>();

  const showImage = (event: ReactMouseEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const clickedImage = event.target.closest('img');

    if (!(clickedImage instanceof HTMLImageElement)) {
      return;
    }
    const root = event.currentTarget;
    const contentImages = getContentImages(root);
    const index = contentImages.indexOf(clickedImage);

    if (index < 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const images = contentImages.map(image => ({
      src: image.currentSrc || image.src,
      alt: image.alt,
      title: image.title,
      width: image.naturalWidth,
      height: image.naturalHeight,
    }));

    setOpened({
      images,
      initialIndex: index,
      returnFocusTo: () => getContentImages(root)[index],
    });
  };

  const viewer =
    opened === undefined ? null : (
      <ImageViewer
        messages={messages}
        images={opened.images}
        initialIndex={opened.initialIndex}
        returnFocusTo={opened.returnFocusTo}
        onClose={() => setOpened(undefined)}
      />
    );

  return { showImage, viewer };
}

hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('xml', xml);

function highlightCodeBlock(code: HTMLElement) {
  if (code.dataset['highlighted'] !== undefined) {
    return;
  }
  const classes = `${code.className} ${code.parentElement?.className ?? ''}`;
  const language = /\blang(?:uage)?-([\w-]+)\b/i.exec(classes)?.[1];

  if (language !== undefined) {
    if (/^no-?highlight$/i.test(language)) {
      return;
    }
    if (hljs.getLanguage(language) === undefined) {
      // Put the fallback first while retaining the document's original language class.
      code.className = `language-plaintext ${code.className}`;
    }
  }
  hljs.highlightElement(code);
}

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
  codeLabel,
  copyLabel,
  copied,
  copyFailed,
}: {
  children: ReactNode;
  codeLabel: string;
  copyLabel: string;
  copied: string;
  copyFailed: string;
}) {
  const block = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const code = block.current?.querySelector<HTMLElement>('pre code');

    if (code !== null && code !== undefined) {
      highlightCodeBlock(code);
    }
  });

  return (
    <div className="markdown-code-block" ref={block}>
      <div className="markdown-code-header">
        <span>{codeLabel}</span>
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
  messages: messageOverrides,
  resolveLink,
  afterFirstHeading,
  resolveImage,
}: {
  text: string;
  messages?: Partial<MarkdownMessages>;
  resolveLink?: (url: string) => ContentLink;
  afterFirstHeading?: ReactNode;
  resolveImage?: (url: string) => string;
}) {
  const location = useLocation();
  const messages = { ...commonMessages.en, ...messageOverrides };
  const { showImage, viewer } = useImageViewer(messages);
  let headingInserted = false;

  return (
    <div className="markdown-content" onClickCapture={showImage}>
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
              <div className="markdown-table-cell">{children}</div>
            </th>
          ),
          td: ({ children, style }) => (
            <td style={style}>
              <div className="markdown-table-cell">{children}</div>
            </td>
          ),
          pre: ({ children }) => (
            <CodeBlock
              codeLabel={messages.code}
              copyLabel={messages.copy}
              copied={messages.copied}
              copyFailed={messages.copyFailed}
            >
              {children}
            </CodeBlock>
          ),
          a: ({ href, children }) => {
            const url = resolveLink?.(href ?? '') ?? href ?? '';

            if (typeof url !== 'string') { return <a href={url.resource}>{children}</a>; }
            if (/^(?:https?:|mailto:|tel:|\/\/)/u.test(url)) {
              return (
                <a href={url} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            }
            if (location.pathname === '') {
              return <Link to={url}>{children}</Link>;
            }
            const logical = new URL(
              url,
              `https://local.invalid${location.pathname}${location.search}`,
            );

            return (
              <Link to={`${logical.pathname}${logical.search}${logical.hash}`}>
                {children}
              </Link>
            );
          },
          img: ({ src, alt, title }) => (
            <img
              referrerPolicy="no-referrer"
              src={resolveImage?.(src ?? '') ?? src}
              alt={alt ?? ''}
              title={title}
            />
          ),
        }}
      >
        {text}
      </Markdown>
      {viewer}
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
  resolveLink,
  resolveImage,
  messages: messageOverrides,
}: {
  html: string;
  resolveLink?: (url: string) => ContentLink;
  resolveImage?: (url: string) => string;
  messages?: Partial<ImageViewerMessages>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const { location, navigate, getHref } = useDocsNavigation();
  const messages = { ...commonMessages.en, ...messageOverrides };
  const { showImage, viewer } = useImageViewer(messages);
  const preparedHTML = useMemo(
    () => prepareDocumentHTML(html, resolveLink, resolveImage, getHref),
    [html, resolveLink, resolveImage, getHref],
  );

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
    root.querySelectorAll<HTMLElement>('pre code').forEach(highlightCodeBlock);
  }, [preparedHTML]);

  return (
    <>
      <div
        ref={element => {
          container.current = element;
          if (element !== null) {
            replaceYuqueVideoPlaceholders(element);
          }
        }}
        className="markdown-content lake-content"
        onClickCapture={showImage}
        onClick={event => {
          if (!navigate || !(event.target instanceof Element)) {
            return;
          }
          const anchor = event.target.closest<HTMLAnchorElement>('a[href]');

          if (!anchor || anchor.hasAttribute('data-docs-resource') || !canNavigateLink(event, anchor)) {
            return;
          }
          const to = anchor.dataset['docsTo'] ?? anchor.getAttribute('href')!;

          if (isExternalHref(to)) {
            return;
          }
          const target = new URL(to, `https://local.invalid${location.pathname}${location.search}`);

          event.preventDefault();
          void navigate(`${target.pathname}${target.search}${target.hash}`);
        }}
        dangerouslySetInnerHTML={{ __html: preparedHTML }}
      />
      {viewer}
    </>
  );
});
