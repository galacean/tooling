---
name: api-documentation-translation
description: Translate configured TypeDoc API snapshots into one, several, or all enabled languages using validated extract/apply tasks and persistent translation archives.
---

# API Documentation Translation

Use this skill for TypeDoc API snapshots. Manual pages and package READMEs use `manual-documentation-translation`.

## Choose the scope

Discover the consuming repository's actual docs config from the user's paths, repository documentation or scripts. Read `sourceLocale`, `locales`, `api.packages`, `api.versions`, `api.dataDirectory` and `translationDirectory`. Do not assume a config filename, project name, package, data path or build command. If multiple configs match and the request does not identify one, ask which is in scope.

Use source and target choices already supplied by the user. Otherwise offer the actual source language and a target-language multi-selection, including **all enabled languages**. For a single API project, the source must match its configured authoritative source. `--source-locale all` means all actual sources, not relabeling input or translating through an intermediate language. Target `all` uses the config's enabled locales and excludes the actual source. The tool includes English, Simplified Chinese, Traditional Chinese, Japanese, Korean, German, Portuguese, Spanish, French, Turkish, Arabic, Russian, Ukrainian and Thai, and accepts configured extensions. Do not silently enable languages absent from the config.

Keep the user's package and version scope. The default is the latest configured version; choosing all languages does not select all historical versions.

## Extract, translate, apply

Preview pending work without writing files:

```sh
pnpm exec galacean-docs api extract --config <config> --source-locale <source> --target-locales all --dry-run
```

Replace `all` with a comma-separated selection such as `ja,ko,de`. `--packages <key[,key...]>` restricts packages; `--version <version>` selects a specific version. `--locale <locale>` is the existing single-target alias and cannot be combined with `--target-locales`.

If adding languages to existing generated data, run `api locales sync --config <config>` to create missing language wrappers from verified existing models. This does not rebuild historical source tags or translate their content. Invalid models must be repaired rather than bypassed.

Run extraction again without `--dry-run`. Alternatively, pass wrapper paths selected from the actual API manifest, without combining path mode with selection flags. Never pass a referenced content-addressed snapshot in place of its wrapper.

Tasks live in `<translationDirectory>/api-translation/`; persistent results live in `<translationDirectory>/translation-cache/api/<package>/<version>/<locale>.json`. Do not put tasks in this skill directory, `node_modules`, or generated data.

A valid archive for the exact current source is reused. When the overall source hash differs, a stable field key and valid placeholders do **not** prove the text is unchanged. Compare the current source with the recorded source where available; otherwise review or retranslate the affected fields. Do not copy an old result under a new hash and claim it is current.

Use `reusableTranslations` from the task for fields verified against recorded source fingerprints. Merge these with newly translated fields to produce a complete result. Translate every remaining required task field. Preserve each placeholder exactly once, as well as API identifiers, signatures, types, URLs, anchors, code, reflection IDs and field keys. Save a complete result beside the task:

```json
{
  "locale": "ja",
  "version": "1.2.3",
  "sourceHash": "copy from the current task",
  "translations": {
    "exact field key": "Translated text with {{0}}."
  }
}
```

Apply through the CLI:

```sh
pnpm exec galacean-docs api apply --config <config> <task-path> <translation-path>
```

Apply tasks sharing a model and target language together when possible. Applying one task may update multiple wrappers and invalidate other previously extracted tasks; extract fresh tasks after a stale-target error. Do not edit immutable snapshots or bypass validation. The CLI persists validated translations before updating generated snapshots.

For large selections, work in bounded package/language groups and keep track of every selected target. After apply, use the project's actual commands to regenerate derived data, search and routes. `translations status --config <config>` inventories coverage; `translations check --config <config> --require-complete` fails when required translations remain incomplete.

Report selected sources/targets, reused results, new translations, review-needed items and failures. Distinguish structural validation from language review. Completing one language is not completion of an all-language request. Do not call external translation services or publish content as part of this skill.
