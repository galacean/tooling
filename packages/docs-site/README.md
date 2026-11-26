# @galacean/docs-site

[简体中文](README-zh_CN.md)

React runtime for multilingual API and manual documentation sites, with search, themes, and language switching.

## Install

```sh
pnpm add @galacean/docs-site react react-dom react-markdown react-router-dom remark-gfm highlight.js
```

## Quick start

```tsx
import { DocsSite, createMessageCatalog } from '@galacean/docs-site';
import type { DocsSiteOptions } from '@galacean/docs-site';
import '@galacean/docs-site/index.css';

const { locales, messages } = createMessageCatalog(['en', 'zh-CN'], {
  en: { manualIntro: 'Guides for this project.' },
  'zh-CN': { manualIntro: '项目使用指南。' },
});
type Locale = (typeof locales)[number];

const config: DocsSiteOptions<Locale> = {
  baseURL: '/docs/',
  locales,
  defaultLocale: 'en',
  brandLabel: 'Project',
  brandMarkURLs: { light: '/logo.svg', dark: '/logo-dark.svg' },
  localeLabels: { en: 'English', 'zh-CN': '简体中文' },
  messages,
  manual: true,
};

export default function App() {
  return (
    <DocsSite
      config={config}
      pages={[{ slug: null, render: locale => <h1>{messages(locale).home}</h1> }]}
    />
  );
}
```

`DocsSite` creates its own `BrowserRouter`; mount it outside another router. Load the stylesheet once at the application entry.

- Use `slug: null` for the homepage and give named pages a `title` for each locale. With `bindDocsSitePages`, use the renderer key `/` for the homepage and each named page's slug for its renderer. The homepage also accepts `home` when no page has that slug.
- `manual`: `true` uses the default data directory, `false` disables manuals, and `{ dataURL }` sets a separate directory.
- `api`: supply `DocsSiteAPIOptions<Locale>` to enable API pages.
- `homeHref`: the single destination for Home, Back to home, and brand links, defaulting to `/`. Route paths use `baseURL`; absolute URLs link to another site. Pass the same value to the CLI configuration for its static 404 page.
- `dataBaseURL`: the published prefix before `data/`, defaulting to `baseURL`. Select a local or CDN prefix in the application and deploy the generated data there.

See [configuration types](src/config/types.ts) for all options. Generation settings belong to the CLI's `docs.config` file; pass runtime options explicitly to `DocsSite`.

## Multilingual sites

Built-in UI languages are `en`, `zh-CN`, `zh-TW`, `ja`, `ko`, `de`, `pt`, `es`, `fr`, `tr`, `ar`, `ru`, `uk`, and `th`. Configure only the languages your project enables; upgrading does not enable all languages automatically.

```ts
import { builtInLocales, createMessageCatalog } from '@galacean/docs-site';

const { locales, messages } = createMessageCatalog(builtInLocales);
// Or choose a subset: createMessageCatalog(['en', 'ja', 'ar'] as const).
```

Common UI messages, manual introduction and count labels have built-in defaults. Empty product dictionaries are unnecessary. Product-specific keys must cover every enabled locale; product messages override common messages. `localeLabels` and API `symbolCountLabelTemplates` are optional overrides. Counts use locale-aware plural and number formatting.

Use the same `locales` declaration in build and runtime configuration. Import language helpers and types from the main `@galacean/docs-site` entry, which can also be loaded in Node. Browser APIs are accessed when browser features run, rather than at module initialization. Canonical BCP 47 content IDs are required; explicit README filenames can still use underscores.

Optional `i18n.localeDefinitions` supplies language labels, direction and script; `i18n.commonMessages` supplies common-message overrides or complete dictionaries for additional languages. Pass the same options to `createMessageCatalog(locales, productMessages, i18n)` and `DocsSite` config. Simplified/traditional Chinese and regional language-pack matching preserve writing systems. `getCommonMessageIssues(locale, i18n)` reports incomplete custom dictionaries.

The shell sets `html.lang` and `html.dir` on every navigation. Arabic uses RTL layout, while code and signatures retain LTR isolation. Manual source fallback carries its actual content language and a visible notice; API comments and README bodies also retain their source language. Dates, search normalization and language-menu labels follow the configured locales. Static metadata uses the same language resolver; fallback-only bodies are excluded from translated-language alternates when coverage metadata is available.

Standalone Markdown, HTML and image-viewer components accept message overrides and use English defaults outside a configured site.

## Code highlighting

Markdown and HTML code blocks support TypeScript, JSON, Bash, plain text (`text`, `txt`, `plaintext`),
and HTML/XML. Unknown explicit languages render as plain text without language warnings. Explicit
`nohighlight` and `no-highlight` markers disable highlighting; blocks without a language keep automatic detection.

Applications can register additional languages with `highlight.js/lib/core` before rendering the site:

```ts
import hljs from 'highlight.js/lib/core';
import glsl from 'highlight.js/lib/languages/glsl';

hljs.registerLanguage('glsl', glsl);
```

## Development

```sh
pnpm --filter @galacean/docs-site build
pnpm --filter @galacean/docs-site test
pnpm --filter @galacean/docs-site check:ts
```
