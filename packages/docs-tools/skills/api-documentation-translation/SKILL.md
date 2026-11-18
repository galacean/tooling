---
name: api-documentation-translation
description: 'Translate TypeDoc API snapshot JSON using the repository-configured source and target locales while preserving API structure and immutable tokens.'
argument-hint: 'Attach one or more API snapshot files and specify the desired target locale.'
---

# TypeDoc API Snapshot Translation

Use this Skill only for API snapshots produced by TypeDoc. Do not use it for Markdown manuals, UI messages, arbitrary JSON, or source-code comments.

## Procedure

1. Identify the consuming repository's docs config. Use a path provided by the user or task; otherwise consult repository documentation and project scripts, then inspect candidate config files for `sourceLocale`, configured locales, `api.dataDirectory`, and `translationDirectory`. If multiple configs match, ask which site/package is in scope instead of guessing. Do not assume a config filename or data directory. Read `<api.dataDirectory>/manifest.json` and select the package by its configured key. Choose the target locale's wrapper path from `current.json` for the latest version or from the desired entry in `versions[].json` for a specific version. Never infer a locale from a filename.
2. From the repository root, create a translation task with the shared CLI:

   ```bash
   pnpm exec galacean-docs api extract --config <docs-config> <snapshot-wrapper-path>
   ```

   With the package-key layout, the wrapper path has the form `<api.dataDirectory>/<package-key>/<version>/<locale>.api.json`; use the actual version from the manifest. The wrapper may contain a `$ref` to a content-addressed file under `api/snapshots/`. Pass the wrapper path from the manifest, not the referenced snapshot; `api extract` resolves the reference itself.

3. Before translating, inspect `<translationDirectory>/translation-cache/api/<package-key>/<version>/<locale>.json`. Always use the newly extracted task as the current validation source. If an archive exists with matching locale, version, and source hash, reuse it as the translation result and apply it directly. If its source hash differs, reuse only fields whose exact key remains in the task and whose placeholder validation succeeds; report changed source text for human review and translate missing fields. Do not use a hash as the archive lookup key or skip task validation.
4. Translate every still-missing extracted comment field into the requested target locale. Preserve each placeholder exactly once. Never alter identifiers, signatures, types, URLs, anchors, code tokens, reflection IDs, field keys, or non-comment JSON data.
5. Save a JSON result beside the generated task. Copy `locale`, `version`, and `sourceHash` from the task, and put the complete translations in a `translations` object keyed by each field's exact `key`:

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

6. Apply the result through the shared CLI. It revalidates the source, target, task fields, locale paths, and manifest before writing. A valid result is persisted to the archive before generated snapshots are updated:

   ```bash
   pnpm exec galacean-docs api apply --config <docs-config> <task-path> <translation-path>
   ```

   `api apply` merges this result with existing translations for the same TypeDoc model and locale, writes a new content-addressed snapshot, and updates every matching package/version/locale wrapper to reference it. Keep wrappers as `$ref` entries; never replace them with snapshot contents or edit an existing content-addressed snapshot in place. Apply translations for a shared model and locale together when possible. An earlier apply updates all matching wrappers, so tasks extracted before that update become stale and must be extracted again.

7. If the task is stale or validation fails, extract a fresh task. Do not edit snapshots manually or bypass validation.

After applying translations, use the consuming repository's documented command to regenerate derived site data and search indexes. Do not assume a particular command name or that the repository has a Makefile.

Translation archives belong under `<translationDirectory>/translation-cache/api/`. Disposable task data belongs under `<translationDirectory>/api-translation/`, which defaults to the repository's ignored `tmp/docs-tools/api-translation/` directory. Never place task data in this Skill directory or in `node_modules`.
