import { contentHash } from '../content-hash';

export type DocumentKind = 'manual' | 'package-readmes';
export type TranslationStatus = 'source' | 'translated' | 'missing' | 'needs-review';

export interface TranslationDocument {
  kind: DocumentKind;
  owner: string;
  key: string;
  slug: string;
  sourceLocale: string;
  format: 'markdown' | 'html';
  content: string;
  title: string;
  group: string;
  maintainedFiles: Record<string, string>;
}

export interface DocumentTranslation {
  status: TranslationStatus;
  content?: string;
  title?: string;
  group?: string;
}

export function documentSourceHash(document: Pick<TranslationDocument, 'content' | 'title' | 'group' | 'sourceLocale' | 'format'>): string {
  return contentHash({ content: document.content.replace(/\r\n/gu, '\n').trimEnd(),
    title: document.title, group: document.group, sourceLocale: document.sourceLocale, format: document.format });
}
