---
name: manual-documentation-translation
description: Translate synchronized documentation manuals between configured locales while preserving Markdown structure, code, identifiers, links, and review state.
---

# Manual Documentation Translation

Use this Skill only for Markdown manual pages configured through the site's `manuals` collections. API reference snapshots use `api-documentation-translation` instead.

## Workflow

1. Read the site configuration and identify the selected collection, its source locale, target locale, source directory, stable route slugs, and translation directory. Never read or print secrets from environment files.
2. Read the synchronized source Markdown and current `manual/navigation.json`. Translate only the requested collection or route slugs.
3. Preserve heading levels, lists, tables, links, images, HTML blocks, code fences, inline code, placeholders, front matter, and file names. Do not translate API names, identifiers, commands, URLs, paths, protocol fields, or code examples.
4. Write each target page as `<translation-directory>/<route-slug>.md`. Do not replace an existing translation without first comparing it with the source and explaining the proposed changes.
5. When localized navigation labels need updating, maintain `<translation-directory>/navigation.json` as a JSON object keyed by route slug. Each value may contain translated `title` and `group` strings, for example:

   ```json
   {
     "getting-started": {
       "title": "Getting started",
       "group": "Guides"
     }
   }
   ```

6. Compare the current source with any existing target translation. If the source changed, mark the translation as needing review; do not silently overwrite it or claim that it is current.
7. Check internal links, anchors, image and attachment paths, code-fence balance, placeholders, and front matter. Keep external URLs unchanged.
8. Run `galacean-docs manual sync --config <site-config>` when source data needs refreshing, then run the site's manual/search/routes checks. Do not call machine-translation APIs or Yuque APIs from the translation workflow.

## Output Requirements

- Keep one Markdown file per stable route slug and target locale.
- Preserve source ordering and route slugs; translations must not rename routes.
- Never include credentials, ignored source content, or private document data in translation files or logs.
- Report untranslated pages and source changes that need human review.
