import { headingId } from '@galacean/docs-site';
import { DomUtils, parseDocument } from 'htmlparser2';
import type { Nodes } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const markdown = unified().use(remarkParse).use(remarkGfm);

function headingText(node: Nodes): string {
  if ('children' in node) {
    return node.children.map(headingText).join('');
  }

  return node.type === 'text' || node.type === 'inlineCode' ? node.value : '';
}

function inspectMarkdown(text: string) {
  const normalized = text.replace(/\r\n/gu, '\n');
  const frontMatter = /^---\n[\s\S]*?\n---(?:\n|$)/u.exec(normalized)?.[0] ?? '';
  const body = normalized.slice(frontMatter.length);
  const ids = new Set<string>();
  const links: string[] = [];
  const structure: unknown[] = [frontMatter];
  const definitions = new Map<string, string>();
  const references: string[] = [];

  function visit(node: Nodes): void {
    const raw = () => body.slice(node.position!.start.offset, node.position!.end.offset);

    switch (node.type) {
      case 'heading':
        ids.add(headingId(headingText(node)));
        structure.push([node.type, node.depth]);

        break;
      case 'code':
      case 'inlineCode':
        structure.push([node.type, raw()]);

        break;
      case 'html':
        structure.push([node.type, node.value]);
        for (const element of DomUtils.findAll(el => el.attribs['id'] !== undefined, parseDocument(node.value).children)) {
          ids.add(element.attribs['id']!);
        }

        break;
      case 'definition':
        definitions.set(node.identifier, node.url);
        structure.push([node.type, node.identifier, node.url.startsWith('#') ? '#' : node.url, node.title]);

        break;
      case 'linkReference':
      case 'imageReference':
        structure.push([node.type, node.identifier]);
        if (node.type === 'linkReference') {
          references.push(node.identifier);
        }

        break;
      case 'link':
      case 'image':
        if (node.type === 'link' && node.url.startsWith('#')) {
          links.push(node.url);
          structure.push([node.type, '#']);
        } else {
          structure.push([node.type, node.url]);
        }

        break;
      case 'list':
        structure.push([node.type, node.ordered, node.start, node.children.length]);

        break;
      case 'listItem':
        structure.push([node.type, raw().match(/^(?:[-+*]|\d+[.)])/u)?.[0], node.checked]);

        break;
      case 'table':
        structure.push([node.type, node.align, node.children.map(row => row.children.length)]);

        break;
    }
    if ('children' in node) {
      node.children.forEach(visit);
    }
  }

  visit(markdown.parse(body));
  for (const id of references) {
    const url = definitions.get(id);

    if (url !== undefined && url.startsWith('#')) {
      links.push(url);
    }
  }

  return { structure, ids, links };
}

export function validateDocumentTranslation(source: string, target: string, format: 'markdown' | 'html'): void {
  if (target.trim() === '') {
    throw new Error('Empty document translation');
  }
  const placeholders = (text: string) => (text.match(/\{\{[^{}]+\}\}|\$\{[^{}]+\}/gu) ?? []).sort();

  if (JSON.stringify(placeholders(source)) !== JSON.stringify(placeholders(target))) {
    throw new Error('Translation changed protected placeholders');
  }
  if (format === 'html') {
    const structure = (text: string) => {
      const document = parseDocument(text);
      const visit = (node: (typeof document.children)[number], protectedText = false): unknown => {
        const protectedNode = protectedText || 'name' in node && ['pre', 'code', 'script', 'style'].includes(node.name);

        if ('data' in node && !('name' in node)) {
          return protectedNode ? node.data : '#text';
        }

        return { type: node.type, ...('attribs' in node ? { name: node.name, attributes: node.attribs } : {}),
          ...('data' in node ? { data: node.data } : {}),
          ...('children' in node ? { children: node.children.map(child => visit(child, protectedNode)) } : {}) };
      };

      return document.children.map(node => visit(node));
    };

    if (JSON.stringify(structure(source)) !== JSON.stringify(structure(target))) {
      throw new Error('HTML translation changed protected structure, attributes or code');
    }
  } else {
    const original = inspectMarkdown(source);
    const translated = inspectMarkdown(target);

    if (JSON.stringify(original.structure) !== JSON.stringify(translated.structure)) {
      throw new Error('Markdown translation changed protected structure, code, URLs or placeholders');
    }
    for (const anchor of translated.links) {
      if (!translated.ids.has(decodeURIComponent(anchor.slice(1)))) {
        throw new Error(`Unresolved translated anchor: ${anchor}`);
      }
    }
  }
}
