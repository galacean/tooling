import { Parser } from 'htmlparser2';
import { isExternalHref } from '../../routing/navigation';
import type { ContentLink } from './content-link';

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

/** Prepare links and image requests before inserting the document into the DOM. */
export function prepareDocumentHTML(
  html: string,
  resolveLink?: (url: string) => ContentLink,
  resolveImage?: (url: string) => string,
  getHref?: (to: string) => string,
): string {
  const parts: string[] = [];
  let cursor = 0;
  let tag = '';
  let isImage = false;
  const policy = 'referrerpolicy="no-referrer"';
  const replace = (start: number, end: number, replacement: string) => {
    parts.push(html.slice(cursor, start), replacement);
    cursor = end;
  };
  const parser = new Parser(
    {
      onopentagname(name) {
        tag = name;
        isImage = name === 'img';
        if (isImage) {
          const offset = parser.startIndex + 4;

          replace(offset, offset, ' ' + policy);
        }
      },
      onattribute(name, value) {
        if (isImage && name === 'referrerpolicy') {
          replace(parser.startIndex, parser.endIndex, '');

          return;
        }
        let url: string;
        let metadata = '';

        if (tag === 'a' && name === 'href') {
          const link = resolveLink?.(value) ?? value;

          if (typeof link === 'string') {
            url = isExternalHref(link) ? link : (getHref?.(link) ?? link);
            if (url !== link) {
              metadata = ` data-docs-to="${escapeAttribute(link)}"`;
            }
          } else {
            url = link.resource;
            metadata = ' data-docs-resource';
          }
        } else if (name === 'src' && ['img', 'video', 'audio', 'source'].includes(tag)) {
          url = resolveImage?.(value) ?? value;
        } else {
          return;
        }
        if (url !== value || metadata !== '') {
          replace(parser.startIndex, parser.endIndex, `${name}="${escapeAttribute(url)}"${metadata}`);
        }
      },
    },
    { decodeEntities: true },
  );

  parser.end(html);
  parts.push(html.slice(cursor));

  return parts.join('');
}
