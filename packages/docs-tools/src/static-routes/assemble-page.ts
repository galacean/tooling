import { getLocaleDefinition } from '@galacean/docs-site';
import type { DocsI18nOptions } from '@galacean/docs-site';
import { DomUtils, parseDocument } from 'htmlparser2';
import type { StaticRoute } from './collect-routes';

export function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

export function parseRouteTemplate(source: string, i18n?: DocsI18nOptions) {
  const document = parseDocument(source);
  const html = DomUtils.findOne(element => element.name === 'html', document.children, false);
  const head = html === null ? null : DomUtils.findOne(element => element.name === 'head', html.children, false);

  if (html === null || head === null) {
    throw new Error('Static route template must contain an HTML head');
  }
  const preserved = head.children.filter(node => {
    if (!('attribs' in node)) {
      return true;
    }
    if (node.name === 'link') {
      const relations = node.attribs['rel']?.toLowerCase().split(/\s+/u) ?? [];

      return !relations.includes('canonical') &&
        !(relations.includes('alternate') && node.attribs['hreflang'] !== undefined);
    }

    return node.name !== 'title' && !(node.name === 'meta' && node.attribs['name']?.toLowerCase() === 'description');
  });

  head.children = preserved;
  const resources = DomUtils.findAll(() => true, document.children)
    .flatMap(node => [node.attribs['src'], node.attribs['href']])
    .filter((value): value is string => value !== undefined && value !== '');

  const render = (
    page: StaticRoute,
    canonical: string | undefined,
    alternates: readonly { locale: string; href: string }[],
  ): string => {
    const metadata = `<title>${escapeHTML(page.title)}</title><meta name="description" content="${escapeHTML(page.description)}">` +
      (canonical === undefined ? '' : `<link rel="canonical" href="${escapeHTML(canonical)}">`) +
      alternates.map(({ locale, href }) =>
        `<link rel="alternate" hreflang="${escapeHTML(locale)}" href="${escapeHTML(href)}">`,
      ).join('');

    html.attribs['lang'] = page.locale;
    html.attribs['dir'] = getLocaleDefinition(page.locale, i18n?.localeDefinitions).direction;
    head.children = [...preserved, ...parseDocument(metadata).children];

    return DomUtils.getOuterHTML(document, { encodeEntities: 'utf8', emptyAttrs: true });
  };

  return { resources, render };
}
