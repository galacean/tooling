# @galacean/docs-site

[简体中文](README-zh_CN.md)

Shared React runtime for bilingual API and manual documentation sites.

## Install

Install the package and its peer dependencies in the consuming React application:

```sh
pnpm add @galacean/docs-site react react-dom react-markdown react-router-dom remark-gfm highlight.js
```

## Use

Import `DocsSite` and its configuration types from `@galacean/docs-site`, and load `@galacean/docs-site/index.css` once. Mount `DocsSite` at the application root; it creates its own `BrowserRouter`.

Provide the site brand, locales, localized messages, API data settings, and a `pages` registry. A page has a `slug`, a `render(locale)` callback, and a localized `title(locale)` except for the homepage, whose slug is `null`. Product page content and typography remain application-owned.

API and manual data are served as static files. `manualDataURL` defaults to `${dataBaseURL}data/manual/`; configure it when the published manual directory uses another URL. Use `getSearchDataURL` to map search indexes to their published URL.

## Exports

The package also exports `CopyButton`, `Icon`, `SearchPanel`, `useTheme`, message catalog helpers, API and manual data clients, route helpers, and component barrels. `SearchPanel` can be used without a router when given localized messages, a `loadItems` function, and a `navigate` callback. Route and shell components need a React Router context.

## Development

```sh
pnpm --filter @galacean/docs-site build
pnpm --filter @galacean/docs-site test
pnpm --filter @galacean/docs-site check:ts
```
