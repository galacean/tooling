---
name: api-documentation-translation
description: 'Translate TypeDoc API snapshot JSON using the repository-configured source and target locales while preserving API structure and immutable tokens.'
argument-hint: 'Attach one or more API snapshot files and specify the desired target locale.'
---

# TypeDoc API Snapshot Translation

Use this Skill only for API snapshots produced by TypeDoc. Do not use it for Markdown manuals, UI messages, arbitrary JSON, or source-code comments.

## Procedure

1. Read the consuming repository's site config to identify `sourceLocale`, the configured target locale, and `api.dataDirectory`. Read `<api.dataDirectory>/manifest.json` and select the package by its configured key. Choose the target locale's path from `current.json` for the latest version or from the desired entry in `versions[].json` for a specific version. Never infer a locale from a filename.
2. From the repository root, create a translation task with the shared CLI:

   ```bash
   pnpm exec galacean-docs api extract --config site/site.config.ts <snapshot-path>
   ```

   With the current package-key layout, the selected path has the form `<api.dataDirectory>/<package-key>/<version>/<locale>.api.json`; use the actual version in the path, not the literal `current`. For example:

   ```bash
   pnpm exec galacean-docs api extract --config site/site.config.ts site/public/data/api/agent-sdk/0.0.1-alpha.0/zh-CN.api.json
   ```

   The per-package/version/locale file is a wrapper that may contain a `$ref` to a content-addressed file under `api/snapshots/`. Pass the wrapper path from the manifest, not the referenced `api/snapshots/<hash>.api.json` file; `api extract` resolves the reference itself and only accepts the package-key path layout.

3. Translate every extracted comment field into the requested target locale. Preserve each placeholder exactly once. Never alter identifiers, signatures, types, URLs, anchors, code tokens, reflection IDs, field keys, or non-comment JSON data.
4. Save a JSON result beside the generated task. Copy `locale`, `version`, and `sourceHash` from the task, and put translations in a `translations` object keyed by each field's exact `key`:

    ```json
    {
       "locale": "en",
       "version": "1.2.3",
       "sourceHash": "copy the task sourceHash",
       "translations": {
          "@example/package|root|Widget|summary": "A widget with {{0}}."
       }
    }
    ```

5. Apply the result through the shared CLI. It revalidates the source, target, task fields, locale paths, and manifest before writing:

   ```bash
   pnpm exec galacean-docs api apply --config site/site.config.ts <task-path> <translation-path>
   ```

   `api apply` merges this result with existing translations for the same TypeDoc model and locale, writes one new content-addressed snapshot under `api/snapshots/`, and updates every matching package/version/locale index to reference it. Keep indexes as `$ref` wrappers; never replace them with snapshot contents or edit an existing content-addressed snapshot in place. Apply translations for a shared model and locale together when possible. An earlier apply updates all matching indexes, so tasks extracted before that update become stale and must be extracted again.

6. If the task is stale, a source hash changed, or validation fails, stop and extract a fresh task. Do not edit snapshots manually or bypass validation.

Translation tasks belong under the configured `translationWorkDirectory`, which defaults to the repository's ignored `tmp/docs-tools/api-translation/` directory. Never place task data in this Skill directory or in `node_modules`.
