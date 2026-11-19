---
name: manual-documentation-translation
description: Translate configured Markdown and HTML manuals while preserving document structure, code, identifiers, links, and review state.
---

# Manual Documentation Translation

Use this Skill only for manual pages configured through the site's `manual.collections`. It supports Markdown and HTML pages. API reference snapshots use `api-documentation-translation` instead.

## Locate the Source

1. Identify the consuming repository's docs config. Inspect locales, `manual.collections`, and `translationDirectory`. If the task does not name a collection, inventory all collections and target locales before translating; do not stop after the first collection. Never read or print secrets from environment files.
2. Use each collection's `source.locale` as its source language; the site-level `sourceLocale` applies to API docs and may differ. Check the source directory and existing generated/manual snapshots for already-authored target-language pages before translating. If a complete target-language page already exists, compare it with the current source, then copy/migrate it into the archive without translating again. Only translate missing pages or pages whose existing translation is outdated or incomplete. Report the reused, translated, and review-needed counts separately.
3. Prioritize collections with missing target-language content. For Yuque collections, use an already-synced source-locale page from `manual.dataDirectory` when available; this is a local snapshot and does not require a remote request. If no local source snapshot exists, do not fetch Yuque unless the user authorizes it. Use Yuque `docId` as the archive key; for local Markdown use the route slug.
4. Persist target pages under `<translationDirectory>/translation-cache/manual/<collection-key>/<target-locale>/`. Preserve the source format and extension: Markdown uses `<document-key>.md`; HTML uses `<document-key>.html`. Do not convert HTML documents to Markdown. Do not write translations into `manual.dataDirectory` or the source directory.
5. For HTML, preserve the original element tree, order, and all attributes exactly. Translate only human-readable text-node strings; do not change tags, `id`, `class`, `style`, `href`, `src`, data attributes, image URLs, code, or markup. Keep the result as HTML. For Markdown, preserve heading levels, lists, tables, links, images, code fences, inline code, placeholders, front matter, and file names. Do not translate API names, identifiers, commands, URLs, paths, protocol fields, or code examples.
6. Compare existing target text with the source before changing it. Report source changes that need review; do not silently overwrite an existing translation or claim that it is current.
7. Update the archive locale's `navigation.json`, keyed by the same document key, to override `title` and `group`:

   ```json
   {
     "getting-started": {
       "title": "Getting started",
       "group": "Guides"
     }
   }
   ```

8. Check internal links, anchors, image and attachment paths, code-fence balance, placeholders, front matter, and HTML structure. Keep external URLs unchanged.
9. After editing, use the repository's documented command to sync manuals, then run any documented search/data generation and validation steps. Do not assume a particular command name or that the repository has a Makefile.

For Yuque-backed collections, use `docId` as the archive identity even if the route slug changes. If a Yuque document has no `docId`, use the configured namespace/slug mapping and report that renaming either value requires archive migration. Refreshing Yuque source data is a separate sync operation and may contact Yuque; do not fetch remote content as part of translation without authorization. Never call machine-translation APIs.

## Output Requirements

- Keep one archive file per stable document key and target locale, using `.md` or `.html` to match the source format.
- Preserve source ordering and route slugs; translations must not rename routes.
- Never include credentials or private document data in translation files or logs.
- Report untranslated pages and source changes that need human review.
