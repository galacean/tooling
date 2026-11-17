---
name: manual-documentation-translation
description: Translate synchronized documentation manuals between configured locales while preserving Markdown structure, code, identifiers, links, and review state.
---

# Manual Documentation Translation

Use this Skill only for Markdown manual pages configured through the site's `manuals` collections. API reference snapshots use `api-documentation-translation` instead.

## Locate the Source

1. Identify the consuming repository's docs config. Use a path provided by the user or task; otherwise consult repository documentation and project scripts, then inspect candidate config files for locales, `manual.dataDirectory`, and `manual.collections`. If multiple configs match, ask which site/collection is in scope instead of guessing. Read the selected collection's source type and directory, plus any translation directories. Never read or print secrets from environment files.
2. Use the collection's configured `source.directory` as the authored input. If it differs from `manual.dataDirectory`, do not edit generated output. If they share a directory, only edit entries marked `source: { type: 'local' }`; leave generated entries unchanged.
3. In a local collection, source pages use `<source.directory>/<locale>/<slug>.md`. If no translation directory is configured, write the target locale under that same source directory. If `translations[targetLocale]` is configured, write to that directory using the configured route slug.
4. Preserve heading levels, lists, tables, links, images, HTML blocks, code fences, inline code, placeholders, front matter, and file names. Do not translate API names, identifiers, commands, URLs, paths, protocol fields, or code examples.
5. Compare existing target text with the source before changing it. Report source changes that need review; do not silently overwrite an existing translation or claim that it is current.
6. Update localized navigation labels in the source `navigation.json` for local collections. For a configured translation directory, use its optional `navigation.json`, keyed by route slug, to override `title` and `group`:

   ```json
   {
     "getting-started": {
       "title": "Getting started",
       "group": "Guides"
     }
   }
   ```

7. Check internal links, anchors, image and attachment paths, code-fence balance, placeholders, and front matter. Keep external URLs unchanged.
8. After editing, use the repository's documented command to sync manuals, then run any documented search/data generation and validation steps. Do not assume a particular command name or that the repository has a Makefile.

For Yuque-backed collections, translate the synchronized source and configured translation directory. Refreshing Yuque source data is a separate sync operation and may contact Yuque; do not fetch remote content as part of translation without authorization. Never call machine-translation APIs.

## Output Requirements

- Keep one Markdown file per stable route slug and target locale.
- Preserve source ordering and route slugs; translations must not rename routes.
- Never include credentials or private document data in translation files or logs.
- Report untranslated pages and source changes that need human review.
