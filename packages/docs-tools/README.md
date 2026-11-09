# @galacean/docs-tools

[简体中文](README-zh_CN.md)

`@galacean/docs-tools` is a command-line tool for documentation site repositories. It generates API documentation data, prepares translation tasks, builds search indexes and static routes, and synchronizes the translation skill maintained by this package.

The supported public interface is the `galacean-docs` command. This package does not expose its TypeScript implementation as a Node.js import API. Node.js 24 or later is required.

## Install and Run

Install it as a development dependency in the repository that owns the documentation site:

```sh
pnpm add -D @galacean/docs-tools
```

Run commands from the consumer repository root. Every command requires a site config passed with `--config`; the config path is resolved relative to the current working directory:

```sh
pnpm exec galacean-docs api generate --config site/site.config.ts
pnpm exec galacean-docs package-readmes build --config site/site.config.ts
pnpm exec galacean-docs search build --config site/site.config.ts
pnpm exec galacean-docs routes build --config site/site.config.ts
pnpm exec galacean-docs skills sync --config site/site.config.ts
```

The config can be JSON or a JavaScript/TypeScript module. At minimum, declare the source locale, supported locales, and API data directory:

```ts
export default {
	siteName: 'Example Docs',
	sourceLocale: 'en',
	locales: ['en', 'zh-CN'],
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
			},
		],
	},
	packageReadmes: {
		engine: {
			en: 'packages/engine/README.md',
			'zh-CN': 'packages/engine/README.zh-CN.md',
		},
	},
};
```

`api.packages` configures API generation. `key` is a stable identifier in the documentation data, `name` must match the package's `package.json`, `directory` points to the package directory, and `tsconfig` points to its TypeScript config. Each `entries` item configures a public entry point: `types` is used to determine the exported declarations, and `source` links them to source code. The optional `api.typedocOptions` and `api.sourceLinkTemplate` configure TypeDoc and source links, respectively.

`packageReadmes` maps API package keys to README paths by locale. If a locale path is not configured or its file is missing, the source-locale README is used. `packageReadmeSourceLocales` can override `sourceLocale` for individual packages. `translationWorkDirectory` defaults to `tmp/docs-tools/api-translation`. Configured data directories, package directories, and file paths must stay inside the repository.

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
pnpm exec galacean-docs skills sync --config site/site.config.ts
pnpm exec galacean-docs skills sync --config site/site.config.ts --check
```

Synchronizes the `api-documentation-translation` skill shipped with this package to `.agents/skills/api-documentation-translation` in the consumer repository. A managed manifest records the package version and file hashes. The command refuses to overwrite a target directory it does not manage or managed files that have been edited manually. `--check` verifies that the installed copy matches the current package version without writing files; it exits with an error when the copy is missing or out of date.

## Recommended Workflow

For an initial build or an update to site data, use this order:

1. Run `api generate` to create API snapshots and the manifest.
2. To update API comment translations, run `api extract`, complete the translations, and then run `api apply`.
3. Run `package-readmes build` and `search build` to generate README data and search indexes.
4. Build the site with its own build command to produce `site/dist`, then run `routes build`.
5. If the repository uses the translation skill, run `skills sync`; CI can use `--check` to verify that it is up to date.

To see command syntax, run:

```sh
pnpm exec galacean-docs --help
```

The TypeScript implementation is packaged for the executable and internal tests only. Consumers should use the `galacean-docs` CLI rather than importing internal modules.
