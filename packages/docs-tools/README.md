# @galacean/docs-tools

[简体中文](README-zh_CN.md)

`@galacean/docs-tools` is a command-line tool for documentation site repositories. It generates API documentation data, prepares translation tasks, builds search indexes and static routes, and synchronizes the translation skill maintained by this package.

The supported public interface is the `galacean-docs` command. This package does not expose its TypeScript implementation as a Node.js import API. Node.js 24 or later is required.

## Install and Run

Install it as a development dependency in the repository that owns the documentation site:

```sh
pnpm add -D @galacean/docs-tools
```

Run commands from the consumer repository root. Site data commands require a site config passed with `--config`; the config path is resolved relative to the current working directory. `skills sync` operates on the current repository and does not require a site config:

```sh
pnpm exec galacean-docs api generate --config site/site.config.ts
pnpm exec galacean-docs manual sync --config site/site.config.ts
pnpm exec galacean-docs package-readmes build --config site/site.config.ts
pnpm exec galacean-docs search build --config site/site.config.ts
pnpm exec galacean-docs routes build --config site/site.config.ts
pnpm exec galacean-docs skills sync
```

The config can be JSON or a JavaScript/TypeScript module. The source locale and supported locales are required; `api` and `manual` are independent optional sections. If one section is omitted, its data directory defaults beside the configured section. If both are omitted, the default directories are `site/public/data/api` and `site/public/data/manual`. Search and route builds include only configured API/manual content. API generation requires `api.packages`.
Directories outside the site's default public data paths must be exposed by the consuming site's static hosting configuration. For `@galacean/docs-site`, set `site.manualDataURL` to the published manual directory and use `getSearchDataURL` when search indexes are published at a non-default URL.

```ts
export default {
  siteName: 'Example Docs',
  sourceLocale: 'en',
  locales: ['en', 'zh-CN'],
  manual: {
    dataDirectory: 'site/public/data/manual',
  },
  api: {
    dataDirectory: 'site/public/data/api',
    packages: [
      {
        key: 'engine',
        name: '@example/engine',
        directory: 'packages/engine',
        tsconfig: 'tsconfig.json',
        entries: [
          { key: 'root', source: 'src/index.ts', types: 'dist/index.d.ts' },
        ],
        readme: {
          files: {
            en: 'README.md',
            'zh-CN': 'README.zh-CN.md',
          },
        },
      },
    ],
  },
};
```

`api.packages` configures API generation. `key` is a stable identifier in the documentation data, `name` must match the package's `package.json`, `directory` points to the package directory, and `tsconfig` points to its TypeScript config. Each `entries` item configures a public entry point: `types` is used to determine the exported declarations, and `source` links them to source code. The optional `api.typedocOptions` and `api.sourceLinkTemplate` configure TypeDoc and source links, respectively.

Each API package can declare its own `readme.files` map, with paths relative to that package's `directory`. `readme.sourceLocale` optionally overrides the site-wide `sourceLocale` for that package. If a localized README is not configured or its file is missing, the source README is used. `translationWorkDirectory` defaults to `tmp/docs-tools/api-translation`. Configured data directories, package directories, and file paths must stay inside the repository.

### Manual Collections

`manual.collections` is optional, so existing sites can continue to provide `manual/navigation.json` and Markdown directly. When configured, `manual sync` assembles all collections into that same static data contract. Collection keys and generated route slugs must be unique.

```ts
manual: {
  dataDirectory: 'site/public/data/manual',
  collections: [
  {
    key: 'product-guide',
    routePrefix: 'product',
    source: {
      type: 'yuque',
      mode: 'repo',
      baseURL: 'https://www.yuque.com/api/v2',
      namespace: 'team/product-guide',
      tokenEnv: 'YUQUE_TOKEN',
      locale: 'zh-CN',
    },
    ignore: {
      docIds: [],
      slugs: ['draft'],
      titleContains: ['[private]'],
    },
    translations: { en: 'site/manual-translations/product-guide/en' },
  },
  {
    key: 'selected-articles',
    source: {
      type: 'yuque',
      mode: 'documents',
      baseURL: 'https://www.yuque.com/api/v2',
      tokenEnv: 'YUQUE_TOKEN',
      locale: 'zh-CN',
      documents: [
        {
          namespace: 'team/one',
          slug: 'getting-started',
          routeSlug: 'getting-started',
          group: 'Guides',
        },
        {
          namespace: 'team/two',
          slug: 'migration',
          routeSlug: 'migration',
          group: 'Migration',
        },
      ],
    },
  },
  {
    key: 'local-notes',
    source: {
      type: 'local',
      directory: 'site/manual-local/notes',
      locale: 'en',
    },
  },
  ],
}
```

Only the grouped fields are supported: API README mappings belong under each `api.packages[].readme`, and manual collections belong under `manual.collections`. Former top-level README maps and API-level README maps are rejected.

`repo` reads the ordered TOC and applies `ignore` before fetching document bodies; ignored `TITLE` nodes exclude their descendants. `documents` requests only the ordered allowlist and never reads a TOC. A document may specify `docId` so `ignore.docIds` can skip it before the request. `documentRefs` matches exact `namespace`/`slug` pairs. `slugs` and `titleContains` are for repo mode. A local collection directory contains `navigation.json` plus `<locale>/<slug>.md` files.

Yuque `baseURL` must be an HTTP(S) API base, such as the public or an approved internal endpoint. `tokenEnv` names an environment variable; the token value must not be stored in site config. The source locale must be one of the configured site locales. `routePrefix` prefixes generated route slugs. Translation directories contain `<route-slug>.md`; optional `navigation.json` maps route slugs to translated `title` and `group` values. Missing translations fall back to source Markdown.

A local collection can share the generated `manual/` output directory. Mark authored local items in `navigation.json` with `source: { type: 'local' }`; sync reads only those entries from the shared directory, while Yuque-generated entries are marked `source.type: 'yuque'` and are not re-imported. Their Markdown files remain under `<locale>/<slug>.md`.

## Commands

### `api generate`

```sh
pnpm exec galacean-docs api generate --config site/site.config.ts [package-key...]
```

Reads the versions and TypeScript declarations of configured packages, builds declaration files, and uses TypeDoc to produce reflection data. It filters exports according to the configured public entry points, then assembles API snapshots for each locale and a manifest. Snapshots are stored by content hash, and each package/version JSON file references a shared snapshot. The manifest records current versions, retained versions, and entry metadata. Valid translations from existing history are preserved; untranslated fields fall back to source text, with fallback warnings reported in the command output.

Without package keys, all configured packages are generated. With one or more keys, only those packages are updated; manifest entries and snapshots still referenced by unselected packages remain unchanged. Valid sidecars no longer referenced by any retained version are deleted automatically. The first generation must include every configured package. Each package's `package.json`, `tsconfig`, source entry, and declaration entry must be readable.

### `api extract`

```sh
pnpm exec galacean-docs api extract --config site/site.config.ts <target-snapshot>...
```

Extracts translation tasks from one or more API target snapshots. Each target must be under the configured API data directory and follow `<package-key>/<version>/<locale>.api.json`; its locale must be configured and differ from the source locale. The tool reads the source-locale snapshot for the same version, extracts comment fields that need translation and their placeholder tokens, and writes tasks into a new run directory under `translationWorkDirectory`. The command prints each task path, field count, package version, and target locale.

This command only creates tasks: it does not call a machine-translation service or modify API snapshots. The translation workflow should preserve field keys and token information, and create one corresponding translation JSON file in the same run directory for each task. `api apply` accepts files in task/translation order.

### `api apply`

```sh
pnpm exec galacean-docs api apply --config site/site.config.ts \
	<task.json> <translation.json> [<task.json> <translation.json> ...]
```

Applies translation results to their API snapshots. Each translation file must contain `locale`, `version`, `sourceHash`, and a `translations` map, for example:

```json
{
  "locale": "zh-CN",
  "version": "1.2.3",
  "sourceHash": "<sourceHash from the task>",
  "translations": {
    "<field-key>": "Translated text"
  }
}
```

Task and translation files must come from the same run directory under `translationWorkDirectory`. Before applying results, the tool reloads the current source and target snapshots and checks the config, hashes, fields, and tokens; it rejects stale tasks and validates the translation structure. On success, it merges existing and supplied translations for the same TypeDoc model and locale, writes one new content-addressed snapshot, and updates every matching package/version/locale index to the same `$ref`, along with the associated manifest snapshot identifiers. Snapshots still referenced by retained versions remain unchanged; valid sidecars that become unreachable are deleted automatically. Applied task and translation files are then deleted. Each task must be paired with a translation file, and multiple pairs can be applied in one invocation. Apply translations for packages sharing a model and locale in one batch when possible; after an earlier apply updates their indexes, previously extracted tasks become stale and must be extracted again.

### `api snapshots clean`

```sh
pnpm exec galacean-docs api snapshots clean --config site/site.config.ts
```

Deletes content-addressed snapshots not referenced by any retained manifest version. The command verifies each snapshot filename against its content hash, skips files with mismatched hashes, and aborts on invalid manifests, indexes, or references. It only scans hash-named regular files directly under `api/snapshots/`; wrappers, temporary files, and other directories are not cleaned. `api generate` and `api apply` also clean snapshots automatically after updating the manifest.

### `package-readmes build`

```sh
pnpm exec galacean-docs package-readmes build --config site/site.config.ts
```

Reads the package list from the API manifest, loads each README according to `packageReadmes`, and writes JSON data for every configured locale to `package-readmes/<package-key>/<locale>.json`, alongside the API data directory. An unconfigured or missing localized README falls back to that package's source README, so every package in the manifest must have a source README mapping. The command reports the number of READMEs generated per locale.

### `search build`

```sh
pnpm exec galacean-docs search build --config site/site.config.ts
```

Builds `search/<locale>.json` for each locale. Sources include public symbols and members in the current API snapshots, package READMEs, and manual pages listed in `manual/navigation.json`. Each index contains names, summaries, keywords, and site URLs. Untranslated READMEs fall back to their source locale. This command requires a valid API manifest and snapshots, README mappings, and manual content for each locale.

### `manual sync`

```sh
pnpm exec galacean-docs manual sync --config site/site.config.ts
```

Synchronizes configured local and Yuque collections into `navigation.json` and `<locale>/<route-slug>.md` or `.html` under `manual.dataDirectory`. It reports per-collection file counts, Yuque group counts, and per-file sync status. Yuque requests use the configured `tokenEnv`, a 15-second timeout, and bounded retries for rate limits and server errors. Raw Markdown and Yuque Lake HTML are supported; translation files remain Markdown. The command stages and validates output before replacing the generated manual data. Run it before search and frontend builds. No `manuals` config is required for sites that continue managing static manual data themselves.

### `routes build`

```sh
SITE_BASE_PATH=/docs/ \
VITE_SITE_ORIGIN=https://docs.example.com \
pnpm exec galacean-docs routes build --config site/site.config.ts
```

After the site frontend has been built into `site/dist`, generates static HTML routes for home pages, manual pages, API package pages, and public API symbols. It uses `site/dist/index.html` as the route template and writes route entry files, `routes.json`, `404.html`, and `.nojekyll`. When a site origin is provided, it also adds canonical and localized alternate links. During the build, it verifies that search results point to generated routes and that manual links and assets are valid.

`SITE_BASE_PATH` sets the URL prefix when deploying under a subpath and defaults to `/`. `VITE_SITE_ORIGIN` is optional and is used to generate absolute canonical and language-alternate URLs. This command requires `siteName` in the config, as well as `site/dist/index.html`, the API manifest, manual navigation, and search indexes.

### `skills sync`

```sh
pnpm exec galacean-docs skills sync
pnpm exec galacean-docs skills sync --check
```

Synchronizes the `api-documentation-translation` and `manual-documentation-translation` skills shipped with this package to matching directories under `.agents/skills`. It uses the current working directory as the consumer repository root and does not load a site config. Each managed manifest records the package version and file hashes. The command refuses to overwrite a target directory it does not manage or managed files that have been edited manually. `--check` verifies both copies without writing files; it exits with an error when either copy is missing or out of date.

## Recommended Workflow

For an initial build or an update to site data, use this order:

1. Run `api generate` to create API snapshots and the manifest.
2. If `manuals` is configured, run `manual sync` with the Yuque token environment variable available to the process.
3. To update API comment translations, run `api extract`, complete the translations, and then run `api apply`.
4. Run `package-readmes build` and `search build` to generate README data and search indexes.
5. Build the site with its own build command to produce `site/dist`, then run `routes build`.
6. Run `skills sync`; CI can use `--check` to verify both managed skills.

To see command syntax, run:

```sh
pnpm exec galacean-docs --help
```

The TypeScript implementation is packaged for the executable and internal tests only. Consumers should use the `galacean-docs` CLI rather than importing internal modules.
