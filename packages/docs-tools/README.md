# @galacean/docs-tools

[简体中文](README-zh_CN.md)

CLI for generating API data, syncing local or Yuque manuals, and building search indexes and static routes. Requires Node.js 24+.

## Install and configure

Install and run commands from the documentation repository root:

```sh
pnpm add -D @galacean/docs-tools
```

Create `site/docs.config.json` (TypeScript and JavaScript files are also supported):

```json
{
  "siteName": "Example Docs",
  "sourceLocale": "en",
  "locales": ["en", "zh-CN"],
  "api": {
    "dataDirectory": "site/public/data/api",
    "repository": "https://github.com/example/project.git",
    "versions": ["1.3.0"],
    "packages": [{
      "key": "engine",
      "name": "@example/engine",
      "directory": "packages/engine",
      "tsconfig": "tsconfig.json",
      "entries": [{ "key": "root", "source": "src/index.ts", "types": "dist/index.d.ts" }],
      "readme": { "files": { "en": "README.md", "zh-CN": "README.zh-CN.md" } }
    }]
  },
  "manual": {
    "dataDirectory": "site/public/data/manual",
    "collections": [{
      "key": "guides",
      "source": { "type": "local", "directory": "site/manual", "locale": "en" }
    }]
  }
}
```

`sourceLocale` and `locales` are required; configure `api` and `manual` as needed. See the [configuration field definitions](src/config/types.ts) for Yuque sources and other options; `tokenEnv` names the environment variable holding a Yuque token.

`dataBaseUrls` can declare `production` and `development` prefixes before `data/`. The application selects a prefix; the CLI generates local files for you to publish. Browser configuration is supplied separately to `@galacean/docs-site`.

## Commands

Provide `--config` before other arguments; its path is relative to the repository root:

```sh
pnpm exec galacean-docs api generate --config site/docs.config.json
pnpm exec galacean-docs search build --config site/docs.config.json
pnpm exec galacean-docs --help
```

| Command | Purpose |
| --- | --- |
| `api generate` | Generate the latest configured SemVer version; use `--version <tag>` to select another or `--force` to rebuild. |
| `api extract` / `api apply` | Extract API comment translation tasks and apply results. |
| `api status` | Check API generation and translation archive status. |
| `api translations migrate` | Import complete translations from existing API snapshots. |
| `manual sync` | Sync local or Yuque manual collections. |
| `manual translations migrate` | Import legacy translations with `<collection> <locale> <legacy-dir>` mappings. |
| `package-readmes build` | Generate localized package README data. |
| `search build` | Build indexes from API, README, and manual data. |
| `routes build` | Generate static routes after the frontend build. |
| `skills sync` | Install the bundled translation skills. |

`routes build` requires `siteName` and reads `site/dist/index.html`. Set `SITE_BASE_PATH` for subpath deployments and `VITE_SITE_ORIGIN` for absolute canonical URLs.

## Translation and language selection

The shared UI includes English, Simplified/Traditional Chinese, Japanese, Korean, German, Portuguese, Spanish, French, Turkish, Arabic, Russian, Ukrainian and Thai. `locales` enables the project's subset and accepts custom language definitions and common-message dictionaries through `i18n`. Canonicalized duplicate locale IDs or conflicting locale-map keys are rejected.

Install or verify the two bundled agent skills:

```sh
pnpm exec galacean-docs skills sync
pnpm exec galacean-docs skills sync --check
```

[API translation](skills/api-documentation-translation/SKILL.md) and [manual/README translation](skills/manual-documentation-translation/SKILL.md) offer source selection and multiple/all target selection when the request omits them. Explicit choices are used directly. `all` means configured languages, excluding each document's actual source. A manual collection or README can have a different source language from the API project.

```sh
pnpm exec galacean-docs api locales sync --config <config>
pnpm exec galacean-docs api extract --config <config> --source-locale en --target-locales ja,ko,de --dry-run
pnpm exec galacean-docs manual extract --config <config> --source-locale all --target-locales all
pnpm exec galacean-docs package-readmes extract --config <config> --target-locales all
pnpm exec galacean-docs translations status --config <config>
pnpm exec galacean-docs translations check --config <config> --require-complete
```

`api extract` defaults to the latest configured version; `--version` selects a historical version. `--packages`, `--collections`, and `--pages` restrict their corresponding resource types. `--locale` remains the single-target alias, exclusive with `--target-locales`. `--dry-run` does not create tasks. `api locales sync` adds language wrappers from verified existing models without rebuilding source tags; corrupt models remain errors.

Apply API results using the existing `api apply` result shape. Tasks may include `reusableTranslations`, verified against recorded per-field source fingerprints; merge those values into a complete result and translate the remaining fields. A stable key alone is insufficient to reuse changed source text.

Manual/README task results contain `locale`, `sourceHash`, translated `content`, `title` and `group`. Save them beside their task and run `manual apply` or `package-readmes apply` with task/result pairs. Protected Markdown syntax, HTML element trees/attributes, code and placeholders are validated. Internal Markdown heading links must resolve after translation. Explicitly maintained target files take precedence and must be edited explicitly.

Persistent bodies and commit metadata live in `<translationDirectory>/translation-cache/manual/` or `package-readmes/`; API archives live in `translation-cache/api/`. Disposable tasks use `api-translation/`, `manual-translation/` and `package-readmes-translation/`. Preserve `translation-cache` across generated-data cleanup and ephemeral CI workspaces. Default `translationDirectory` is `tmp/docs-tools`.

Missing target manuals no longer require placeholder files: generation uses a verified archive or marked source fallback. Legacy manual archives without matching source metadata remain available for review and are not silently considered current. After applying results, regenerate the project's manual/README data, search and static routes. `translations check --require-complete` provides a strict release gate. No translation service, remote publication or site deployment is invoked automatically.

## Development

```sh
pnpm --filter @galacean/docs-tools test
pnpm --filter @galacean/docs-tools check:ts
```

## routePaths

```json
{
  "routePaths": {
    "home": "/help/:locale/",
    "manual": "/help/:locale/guides/",
    "api": "/reference/:locale/"
  }
}
```

Use these paths for the standalone site, static pages, sitemap and language alternates. Search indexes store document targets. Embedded applications supply their own link functions.

Static generation creates a separate homepage only when `pages` explicitly declares `{ "slug": null }`. Standalone manual or API integrations do not require one.
