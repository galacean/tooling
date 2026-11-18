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
    generation: { scope: 'latest' },
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
    }],
  },
  translationDirectory: 'tmp/docs-tools',
  cdn: { baseUrl: 'https://cdn.example.com/example-docs/' },
};
```

`api.packages[].entries` identifies public TypeScript entry points. `api.repository` and `api.versions` specify the Git repository and the complete SemVer version list shown by the site. `api.generation.scope` defaults to `latest`, so `api generate` only inspects and builds the highest configured SemVer version. Use `--version <tag>` to backfill a historical version and `--force` to rebuild the selected version. When the selected version matches every API package's local `package.json` version, the checked-out workspace is built without fetching a Git tag. Other versions are built from their matching Git tags. A manual collection can use local Markdown or a Yuque source. Set `tokenEnv` to the name of the environment variable holding a Yuque token; do not put the token in the config.

`translationDirectory` defaults to the ignored `tmp/docs-tools/`. API and manual translations are persisted under `translation-cache/`; disposable API extraction tasks use `api-translation/`. Do not remove the cache when cleaning generated `site/data`. Manual translation archives use the collection key and stable document key; Yuque documents use `docId`, while local Markdown uses its route slug.

`cdn.baseUrl` is the production data root for the consuming docs site, not an upload target. `docs-tools` never uploads data or tracks CDN state. Publish manually by recursively uploading every file under `site/data/` to `${cdn.baseUrl}/data/`, preserving relative paths; validate API, manual, README, and search URLs before switching the production site config. Local builds do not require a CDN URL.

## Commands

Pass the config path relative to the repository root with `--config`:

| Command | Purpose |
| --- | --- |
| `api generate` | Generate only the latest configured SemVer version by default; `--version <tag>` selects a historical version and `--force` reruns the selected version. |
| `api extract` / `api apply` | Prepare API comment translation tasks and apply translated results. |
| `api status` | Report generation integrity and translation archive status for configured versions. |
| `api translations migrate` | One-time migration of complete, validated translations from existing API snapshots. |
| `manual sync` | Synchronize configured local and Yuque manual collections. |
| `manual translations migrate` | One-time migration from explicitly supplied collection translation directories. |
| `package-readmes build` | Generate localized package README data. |
| `search build` | Build localized indexes from API, README, and manual data. |
| `routes build` | Generate static routes after the frontend build. |
| `skills sync` | Install the two bundled skills into `.agents/skills`. |

Example:

```sh
pnpm exec galacean-docs api generate --config site/docs.config.ts
pnpm exec galacean-docs api generate --config site/docs.config.ts --version 1.2.3
pnpm exec galacean-docs api generate --config site/docs.config.ts --force
pnpm exec galacean-docs api status --config site/docs.config.ts
pnpm exec galacean-docs api translations migrate --config site/docs.config.ts
pnpm exec galacean-docs manual translations migrate --config site/docs.config.ts guides zh-CN site/manual-translations/zh-CN
pnpm exec galacean-docs manual sync --config site/docs.config.ts
pnpm exec galacean-docs search build --config site/docs.config.ts
pnpm exec galacean-docs skills sync
```

`routes build` reads `site/dist/index.html`. Set `SITE_BASE_PATH` for a subpath deployment and `VITE_SITE_ORIGIN` to generate absolute canonical URLs. Run `pnpm exec galacean-docs --help` for command syntax.

Migration commands never overwrite an existing translation archive. API migration imports only complete translations from valid snapshots. Manual migration accepts repeated `<collection-key> <locale> <legacy-directory>` triples; run it while the old generated manual `navigation.json` is available so Yuque route slugs can be mapped to stable `docId` keys. Review skipped entries before removing old directories.

## Translation skills

The package includes [api-documentation-translation](skills/api-documentation-translation/SKILL.md) and [manual-documentation-translation](skills/manual-documentation-translation/SKILL.md). Sync them into the consuming repository before use:

```sh
pnpm exec galacean-docs skills sync
pnpm exec galacean-docs skills sync --check
```

The first command writes the managed skill files to `.agents/skills`; `--check` verifies them without writing and can be used in CI. Then ask the coding agent to use the relevant skill, provide the site config path, target locale and translation scope, and attach files or identify the target package/collection. Do not include credentials in the prompt.

### API documentation translation

Use this skill only for TypeDoc API snapshot comments, not manuals, arbitrary JSON, or source-code comments. For example: “Use `api-documentation-translation` with `site/docs.config.ts` to translate the current `engine` API snapshot into `zh-CN`.”

The skill locates the configured API directory and manifest, then selects the requested package, version, and target locale. Before translating, inspect the persistent archive at `<translationDirectory>/translation-cache/api/<package-key>/<version>/<locale>.json`. Extract a fresh task from the wrapper path recorded in the manifest and validate any archived result against that task. Reuse a valid archive without retranslating; when the source hash changed, reuse only matching field keys whose placeholders validate and report the changed source for human review:

```sh
pnpm exec galacean-docs api extract --config <docs-config> <snapshot-wrapper-path>
```

Translate every task field and save a JSON file beside the task. Copy `locale`, `version`, and `sourceHash` from the task, and put translations in a `translations` object keyed by each exact field `key`. Preserve placeholders exactly; do not translate identifiers, signatures, types, URLs, anchors, or code tokens. Apply the result with:

```sh
pnpm exec galacean-docs api apply --config <docs-config> <task.json> <translation.json>
```

Apply related tasks for a shared model and locale together when possible. `api apply` writes the validated result to the persistent archive before updating generated snapshots. If a task is stale or validation fails, extract a fresh task; never edit a wrapper or content-addressed snapshot manually. After applying, run the repository's documented data and search generation steps.

### Manual documentation translation

Use this Skill for Markdown and HTML pages in configured manual collections, not API snapshots. For example: “Use `manual-documentation-translation` with `site/docs.config.ts` to translate missing English pages in the Yuque collection; reuse existing bilingual local guides and report pages needing review.”

The Skill uses each collection's `source.locale`. Reuse complete target-language pages already authored in the source tree by migrating them into the archive; do not translate them again. Prioritize collections and pages missing a target locale. Store archives under `<translationDirectory>/translation-cache/manual/<collection-key>/<locale>/`, keyed by Yuque `docId` or local route slug. Preserve source format: `.md` for Markdown and `.html` for HTML. For HTML, translate text-node strings only and preserve all tags and attributes; never convert it to Markdown. Store localized navigation labels in `navigation.json` using the same key.

Preserve Markdown structure, code, identifiers, links, images, front matter, and file names. Compare existing translations with the source and report changes that need review instead of silently overwriting them. Check links, anchors, assets, placeholders, and code fences. For Yuque collections, translating synchronized files is separate from refreshing Yuque content; do not fetch remote content or call machine-translation APIs as part of translation. Finish with the repository's documented manual sync, search generation, and validation commands.
