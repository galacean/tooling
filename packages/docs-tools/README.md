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

## Translation

Install the bundled skills, then ask your coding agent to use one with the config path, target locale, and package or collection:

```sh
pnpm exec galacean-docs skills sync
pnpm exec galacean-docs skills sync --check
```

- [api-documentation-translation](skills/api-documentation-translation/SKILL.md): translate TypeDoc snapshot comments through extract/apply.
- [manual-documentation-translation](skills/manual-documentation-translation/SKILL.md): translate Markdown or HTML manuals while preserving their format and routes.

Skills are installed in `.agents/skills`; `--check` validates them without writing. Persistent translations live under `<translationDirectory>/translation-cache/`, with `translationDirectory` defaulting to `tmp/docs-tools/`. Preserve this cache when cleaning generated data. Migration commands preserve existing archives; review skipped entries before removing legacy directories.

## Development

```sh
pnpm --filter @galacean/docs-tools test
pnpm --filter @galacean/docs-tools check:ts
```
