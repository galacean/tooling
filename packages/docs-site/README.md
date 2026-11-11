# @galacean/docs-site

[简体中文](README-zh_CN.md)

Shared bilingual documentation site runtime and TypeDoc data contracts.

## Install

Install the package and its peer dependencies in the consuming React application:

```sh
pnpm add @galacean/docs-site react react-dom react-markdown react-router-dom remark-gfm highlight.js
```

## Public API

Import `DocsSite`, its configuration types, common messages, and site data utilities from `@galacean/docs-site`;
load `@galacean/docs-site/index.css` once. Provide the peer dependencies listed in `package.json`.

`DocsSite` owns locale redirects, the shared shell, API/manual routes, lazy search, canonical/hreflang links, and 404
state. Consumers provide `baseURL`, `locales`, `defaultLocale`, `preferenceNamespace`, brand/runtime configuration,
localized product messages, and `renderHome`. Product typography and homepage styles remain consumer-owned.

Mount `DocsSite` in the application root; it creates its own `BrowserRouter` and should not be nested in another router.
Its `site` configuration supplies the brand, locale labels and messages, API data configuration, and optional search
and canonical-origin settings.

The root exports `CopyButton`, `Icon`, `SearchPanel`, and `useTheme` for product pages. `SearchPanel` is a lazily
loaded standalone overlay; provide its localized messages, `loadItems`, and `navigate(url)` callback. It owns a
Suspense fallback and does not require a router context, so consumers can connect results to their own routing
system. The package root also exports the API, manual, search, shared UI, and site component barrels for advanced
composition. Route and shell components require a React Router context; `DocsSite` remains the recommended
integration for a complete site. All components can be imported from `@galacean/docs-site`.

`createMessageCatalog` merges common English and Simplified Chinese UI copy with product-specific messages. API
utilities include manifest/snapshot validation, reflection indexing and loading; `createManualContentClient` handles
manual navigation and document loading. Route helpers include `normalizeBase` for subpath deployments.

## Development

Run `pnpm --filter @galacean/docs-site build` before consuming workspace exports, and rebuild after source changes.
Vite builds the package entry, declarations, lazy route chunks, and CSS assets into `dist`.
Run `pnpm --filter @galacean/docs-site test` and `pnpm --filter @galacean/docs-site check:ts` for package checks.
