# @galacean/docs-tools

[简体中文](README-zh_CN.md)

CLI for generating API data, synchronizing manuals, building search indexes and routes, and using the bundled documentation translation skills. Node.js 24 or later is required.

## Install and configure

Install in the documentation site repository and run commands from its root:

```sh
pnpm add -D @galacean/docs-tools
```

Create a JSON, JavaScript, or TypeScript site config. `sourceLocale` and `locales` are required; configure `api` and `manual` for the data sources used by the site.

```ts
export default {
  siteName: 'Example Docs',
  sourceLocale: 'en',
  locales: ['en', 'zh-CN'],
  api: {
    dataDirectory: 'site/public/data/api',
    repository: 'https://github.com/example/project.git',
    versions: ['1.2.3', '1.3.0'],
    packages: [{
      key: 'engine',
      name: '@example/engine',
      directory: 'packages/engine',
      tsconfig: 'tsconfig.json',
      entries: [{ key: 'root', source: 'src/index.ts', types: 'dist/index.d.ts' }],
      readme: { files: { en: 'README.md', 'zh-CN': 'README.zh-CN.md' } },
    }],
  },
  manual: {
    dataDirectory: 'site/public/data/manual',
    collections: [{
      key: 'guides',
      source: { type: 'local', directory: 'site/manual', locale: 'en' },
      translations: { 'zh-CN': 'site/manual-translations/zh-CN' },
    }],
  },
};
```

`api.packages[].entries` identifies public TypeScript entry points. `api.repository` and `api.versions` specify the Git repository and SemVer versions used by `api generate`. When a configured version matches every API package's local `package.json` version, the checked-out workspace is built without fetching a Git tag. Other configured versions are built from their matching Git tags. A manual collection can use local Markdown or a Yuque source. Set `tokenEnv` to the name of the environment variable holding a Yuque token; do not put the token in the config.

## Commands

Pass the config path relative to the repository root with `--config`:

| Command | Purpose |
| --- | --- |
| `api generate` | Generate API snapshots and the manifest from configured versions, using the current workspace for a matching local package version. |
| `api extract` / `api apply` | Prepare API comment translation tasks and apply translated results. |
| `manual sync` | Synchronize configured local and Yuque manual collections. |
| `package-readmes build` | Generate localized package README data. |
| `search build` | Build localized indexes from API, README, and manual data. |
| `routes build` | Generate static routes after the frontend build. |
| `skills sync` | Install the two bundled skills into `.agents/skills`. |

Example:

```sh
pnpm exec galacean-docs api generate --config site/docs.config.ts
pnpm exec galacean-docs manual sync --config site/docs.config.ts
pnpm exec galacean-docs search build --config site/docs.config.ts
pnpm exec galacean-docs skills sync
```

`routes build` reads `site/dist/index.html`. Set `SITE_BASE_PATH` for a subpath deployment and `VITE_SITE_ORIGIN` to generate absolute canonical URLs. Run `pnpm exec galacean-docs --help` for command syntax.

## Translation skills

The package includes [api-documentation-translation](skills/api-documentation-translation/SKILL.md) and [manual-documentation-translation](skills/manual-documentation-translation/SKILL.md). Sync them into the consuming repository before use:

```sh
pnpm exec galacean-docs skills sync
pnpm exec galacean-docs skills sync --check
```

The first command writes the managed skill files to `.agents/skills`; `--check` verifies them without writing and can be used in CI. Then ask the coding agent to use the relevant skill, provide the site config path, target locale and translation scope, and attach files or identify the target package/collection. Do not include credentials in the prompt.

### API documentation translation

Use this skill only for TypeDoc API snapshot comments, not manuals, arbitrary JSON, or source-code comments. For example: “Use `api-documentation-translation` with `site/docs.config.ts` to translate the current `engine` API snapshot into `zh-CN`.”

The skill locates the configured API directory and manifest, then selects the requested package, version, and target locale. It extracts a task from the wrapper path recorded in the manifest:

```sh
pnpm exec galacean-docs api extract --config <docs-config> <snapshot-wrapper-path>
```

Translate every task field and save a JSON file beside the task. Copy `locale`, `version`, and `sourceHash` from the task, and put translations in a `translations` object keyed by each exact field `key`. Preserve placeholders exactly; do not translate identifiers, signatures, types, URLs, anchors, or code tokens. Apply the result with:

```sh
pnpm exec galacean-docs api apply --config <docs-config> <task.json> <translation.json>
```

Apply related tasks for a shared model and locale together when possible. If a task is stale or validation fails, extract a fresh task; never edit a wrapper or content-addressed snapshot manually. After applying, run the repository's documented data and search generation steps.

### Manual documentation translation

Use this skill for Markdown pages in configured manual collections, not API snapshots. For example: “Use `manual-documentation-translation` with `site/docs.config.ts` to translate the `guides` collection into `zh-CN`; preserve route slugs and report pages needing review.”

The skill reads the selected collection's source and translation directories. Source pages use `<source directory>/<locale>/<slug>.md`; when `translations[targetLocale]` is configured, write translated pages there using the configured route slug. If source and generated output share a directory, edit only pages marked `source: { type: 'local' }` in `navigation.json`. Update localized `title` and `group` entries in the appropriate navigation file.

Preserve Markdown structure, code, identifiers, links, images, front matter, and file names. Compare existing translations with the source and report changes that need review instead of silently overwriting them. Check links, anchors, assets, placeholders, and code fences. For Yuque collections, translating synchronized files is separate from refreshing Yuque content; do not fetch remote content or call machine-translation APIs as part of translation. Finish with the repository's documented manual sync, search generation, and validation commands.
