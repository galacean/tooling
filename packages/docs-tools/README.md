# @galacean/docs-tools

[简体中文](README-zh_CN.md)

Repository documentation generation CLI. The supported public interface is the `galacean-docs` executable; this package
does not expose its TypeScript implementation as a Node.js import API.

Install it as a development dependency in the repository that owns the documentation site:

```sh
pnpm add -D @galacean/docs-tools
```

Run commands from the consumer repository root and pass its site configuration:

```bash
pnpm exec galacean-docs api generate --config site/site.config.ts
pnpm exec galacean-docs package-readmes build --config site/site.config.ts
pnpm exec galacean-docs search build --config site/site.config.ts
pnpm exec galacean-docs routes build --config site/site.config.ts
pnpm exec galacean-docs skills sync --config site/site.config.ts
```

The config can be JSON or a JavaScript/TypeScript module. It declares the source locale, supported locales, API data
directory, and, for API generation, the packages and TypeDoc entry points. API translation workflows use `api extract`
to create translation tasks and `api apply` to apply translated task pairs. `galacean-docs --help` prints command syntax.

The TypeScript implementation is packaged for the executable and internal tests. Consumers should use the CLI rather than
importing internal modules.
