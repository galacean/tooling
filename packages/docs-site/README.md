# @galacean/docs-site

[简体中文](README-zh_CN.md)

Shared bilingual documentation site runtime and TypeDoc data contracts.

## Install

Install the package and its peer dependencies in the consuming React application:

```sh
pnpm add @galacean/docs-site react react-dom react-markdown react-router-dom remark-gfm highlight.js
```

## Public API

The package root is the single supported React entry. Import `DocsSite`, its configuration types, common messages,
and the site data utilities from `@galacean/docs-site`; load `@galacean/docs-site/index.css` once. Provide the peer
dependencies listed in `package.json`.

`DocsSite` owns locale redirects, the shared shell, API/manual routes, lazy search, canonical/hreflang links, and 404
state. Consumers provide `baseURL`, `locales`, `defaultLocale`, `preferenceNamespace`, brand/runtime configuration,
localized product messages, and `renderHome`. Product typography and homepage styles remain consumer-owned.

Mount `DocsSite` in the application root; it creates its own `BrowserRouter` and should not be nested in another router.
Its `site` configuration supplies the brand, locale labels and messages, API data configuration, and optional search
and canonical-origin settings.

The root exports `CopyButton`, `Icon`, and `useTheme` for product homepages. Lower-level API/manual/search page and
layout components remain internal. This keeps the public API compact while preserving lazy page chunks.

`createMessageCatalog` merges common English and Simplified Chinese UI copy with product-specific messages. API
utilities include manifest/snapshot validation, reflection indexing and loading; `createManualContentClient` handles
manual navigation and document loading. Route helpers include `normalizeBase` for subpath deployments.

## Development

Run `pnpm --filter @galacean/docs-site build` before consuming workspace exports, and rebuild after source changes.
Vite builds the package entry, declarations, lazy route chunks, and CSS assets into `dist`.
Run `pnpm --filter @galacean/docs-site test` and `pnpm --filter @galacean/docs-site check:ts` for package checks.
