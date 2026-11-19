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

`DocsSite` requires `baseURL`, `locales`, `defaultLocale`, `site`, and `pages`; `site.brandLabel`, `brandMarkUrls`, `localeLabels`, and `messages` are also required.

Optional `DocsSite` and `site` settings receive defaults once at the site entry point:

- `dataBaseURL` defaults to `baseURL`.
- `site.docsBrandMarkUrls` defaults to `site.brandMarkUrls`.
- `site.getHomeHref(locale)` defaults to the current locale's home path.
- `site.storageKeys` defaults to `locale`, `theme`, and the `search-history` prefix; the locale is appended to search history, for example `search-history:en`.
- `site.siteOrigin` defaults to `window.location.origin`.
- `site.manualDataURL` defaults to `${dataBaseURL}data/manual/`.
- `site.getSearchDataURL(locale)` defaults to `${dataBaseURL}data/search/${locale}.json`.
- `site.api` and `site.githubHref` enable optional features; omitting them hides API navigation or the GitHub link.

Override only the values that need customization:

```ts
storageKeys: {
	locale: 'umi_locale',
	theme: 'ui_theme',
	searchHistory: 'docs-search',
},
getHomeHref: locale => `/docs/${locale}/`,
```

API and manual data are served as static files. Override their published paths with `manualDataURL` and `getSearchDataURL`.

## Exports

The package also exports `CopyButton`, `Icon`, `SearchPanel`, `useTheme`, message catalog helpers, API and manual data clients, route helpers, and component barrels. `SearchPanel` can be used without a router when given localized messages, a `loadItems` function, and a `navigate` callback. Route and shell components need a React Router context.

## Development

```sh
pnpm --filter @galacean/docs-site build
pnpm --filter @galacean/docs-site test
pnpm --filter @galacean/docs-site check:ts
```
