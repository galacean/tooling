---
name: manual-documentation-translation
description: Translate configured Markdown/HTML manuals or package READMEs into selected or all enabled languages, preserving structure and tracking source changes through extract/apply.
---

# Manual and README Translation

Use this skill for configured manual collections and package READMEs. TypeDoc API snapshots use `api-documentation-translation`.

## Discover and select languages

Find the consuming project's actual docs config from user paths, repository documentation or scripts. Read `locales`, `manual.collections`, `api.packages[].readme` and `translationDirectory`. Do not assume a filename, site layout, package name or project build command. Inventory every collection/package in scope before translating.

Manual source languages come from each collection's `source.locale`; README source languages come from `readme.sourceLocale`, falling back to the project's `sourceLocale`. These may differ. Never infer the actual language from the UI or a target directory containing fallback content.

Honor source/target choices already supplied. Otherwise offer the actual source languages and **all sources**, plus target-language multi-selection and **all enabled languages**. All sources means separate tasks for each real source; all targets excludes each document's own source language. A mixed English/Chinese project must calculate targets per collection, not exclude the global API source from every collection. Do not silently enable unconfigured languages or relabel a translation as authoritative source.

Use existing local source files or already-synced Yuque snapshots. If a remote source snapshot is missing, use the user's existing synchronization authorization or ask for the missing access when necessary. Do not read credentials into logs or perform a remote fetch per target language.

## Extract and apply

For manuals, preview pending tasks:

```sh
pnpm exec galacean-docs manual extract --config <config> --source-locale all --target-locales all --dry-run
```

A specific source can replace `all`; targets can be a comma-separated list such as `zh-TW,ja,ar`. Restrict scope with `--collections <key[,key...]>` and `--pages <slug[,slug...]>`. Run without `--dry-run` to create tasks.

For package READMEs, use `package-readmes extract` with the same source/target options and optional `--packages <key[,key...]>`. README files follow explicit `readme.files` mappings, not a guessed filename convention. Existing maintained target files take precedence; do not overwrite them through archive apply.

Tasks contain the exact source, source/target languages, format, identity and validation hashes. Use those task values when producing results beside each task:

```json
{
  "locale": "ja",
  "sourceHash": "copy from the current task",
  "content": "Translated Markdown or HTML",
  "title": "Translated title",
  "group": "Translated group, or an empty string"
}
```

Preserve Markdown headings, list/table structure, front matter, code fences, inline code, placeholders, filenames and external links. Translate prose, not identifiers, commands, protocol fields or code examples. If a translated heading changes its automatic anchor, update matching internal links and verify they resolve.

For HTML, translate only human-readable text nodes. Preserve the element tree, order and all attributes, including `id`, `class`, `style`, `href`, `src` and data attributes. Preserve code, scripts and styles. Keep HTML as HTML; do not convert it to Markdown. Display direction is supplied by the site's container, not by modifying archived HTML attributes.

Apply through the matching command:

```sh
pnpm exec galacean-docs manual apply --config <config> <task-path> <translation-path>
pnpm exec galacean-docs package-readmes apply --config <config> <task-path> <translation-path>
```

The tool validates current source/target state and protected structure, then commits the archive and source metadata. Stale tasks must be re-extracted. Never substitute hashes or directly edit generated output to bypass validation.

## Archives and verification

Manual archives use `<translationDirectory>/translation-cache/manual/<collection>/<locale>/<document-key>.md|.html`, with commit metadata beside the body and a navigation index in the same locale directory. Yuque identities use `doc-<docId>`; fallback identities use the tool's explicit namespace/slug mapping. Local manual identities use source slugs, independently of translated titles and route prefixes.

README archives use `<translationDirectory>/translation-cache/package-readmes/<package>/<locale>.md`, with metadata beside the body. Tasks live in the corresponding `manual-translation/` or `package-readmes-translation/` work directory. Do not place them in skill folders, `node_modules`, source directories or generated data.

Reuse validated archives. Legacy files without source metadata require comparison/review; file existence alone does not prove freshness. Missing or stale translations produce marked source-language fallback. Do not present fallback content or translated navigation alone as completed body translation.

After apply, run the consuming project's manual/README generation, search and route commands. Inspect `translations status --config <config>` and use `translations check --config <config> --require-complete` for a release requiring complete coverage. Report all selected collections/packages and target languages, reused/new results, review-needed items, failures and remaining work. Do not call external translation services or publish content.
