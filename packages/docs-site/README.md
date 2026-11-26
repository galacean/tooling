# @galacean/docs-site

[简体中文](README-zh_CN.md)

React runtime for bilingual API and manual documentation sites, with search, themes, and language switching.

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

## Messages

`createMessageCatalog` merges common English and Chinese messages with product messages; product keys override common keys. Maintain common UI messages in [en.json](src/i18n/en.json) and [zh-CN.json](src/i18n/zh-CN.json).

Standalone components accept localized messages too. `MarkdownContent` and `HTMLDocumentContent` use the common English messages for omitted keys.

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
