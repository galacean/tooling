declare module 'html-to-text' {
  interface HtmlToTextOptions {
    wordwrap?: number | false;
  }

  export function convert(html: string, options?: HtmlToTextOptions): string;
}
