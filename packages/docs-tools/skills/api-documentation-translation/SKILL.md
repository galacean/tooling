---
name: api-documentation-translation
description: 'Translate TypeDoc API snapshot JSON using the repository-configured source and target locales while preserving API structure and immutable tokens.'
argument-hint: 'Attach one or more API snapshot files and specify the desired target locale.'
---

# TypeDoc API Snapshot Translation

Use this Skill only for API snapshots produced by TypeDoc. Do not use it for Markdown manuals, UI messages, arbitrary JSON, or source-code comments.

## Procedure

1. Read the consuming repository's `site/site.config.ts` to identify the source locale, target locale, package key, and snapshot version. Never infer a locale from a filename.
2. From the repository root, create a translation task with the shared CLI:

   ```bash
   pnpm exec galacean-docs api extract --config site/site.config.ts <snapshot-path>
   ```

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

6. If the task is stale, a source hash changed, or validation fails, stop and extract a fresh task. Do not edit snapshots manually or bypass validation.

Translation tasks belong under the repository's ignored `tmp/docs-tools/api-translation/` directory. Never place task data in this Skill directory or in `node_modules`.
