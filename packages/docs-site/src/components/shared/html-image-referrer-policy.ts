import { Parser } from 'htmlparser2';

/** Prepare image requests without creating DOM nodes or rewriting other HTML. */
export function withImageReferrerPolicy(html: string): string {
  const parts: string[] = [];
  let cursor = 0;
  let isImage = false;
  let hasPolicy = false;
  const policy = 'referrerpolicy="no-referrer"';
  const replace = (start: number, end: number, replacement: string) => {
    parts.push(html.slice(cursor, start), replacement);
    cursor = end;
  };
  const parser = new Parser({
    onopentagname(name) {
      isImage = name === 'img';
      hasPolicy = false;
    },
    onattribute(name) {
      if (isImage && name === 'referrerpolicy') {
        hasPolicy = true;
        replace(parser.startIndex, parser.endIndex, policy);
      }
    },
    onopentag(name) {
      if (name === 'img' && !hasPolicy) {
        const offset = parser.startIndex + '<img'.length;

        replace(offset, offset, ` ${policy}`);
      }
    },
  }, { decodeEntities: false });

  parser.end(html);
  parts.push(html.slice(cursor));

  return parts.join('');
}
