# @galacean/docs-site

[English](README.md)

双语 API 与手册文档站点的 React 运行时，提供搜索、主题和语言切换。

## 安装

```sh
pnpm add @galacean/docs-site react react-dom react-markdown react-router-dom remark-gfm highlight.js
```

## 快速开始

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

`DocsSite` 自带 `BrowserRouter`，应挂载在其他 Router 之外。在应用入口加载一次样式。

- 首页使用 `slug: null`，普通页面还需提供各语言的 `title`。使用 `bindDocsSitePages` 时，首页渲染函数使用键 `/`，普通页面使用各自的 slug。如果没有名为 `home` 的页面，首页也可使用键 `home`。
- `manual`：`true` 使用默认数据目录，`false` 关闭手册，`{ dataURL }` 指定独立目录。
- `api`：提供 `DocsSiteAPIOptions<Locale>` 后开启 API 页面。
- `homeHref`：统一指定「首页」「返回首页」及品牌链接的目标地址，默认 `/`。路由路径会添加 `baseURL` 前缀，绝对 URL 可指向其他站点。CLI 配置传入同一值即可统一静态 404 页的首页链接。
- `dataBaseURL`：位于 `data/` 之前的发布前缀，默认使用 `baseURL`。业务选择本地或 CDN 地址，并将生成数据发布到该位置。

完整选项见[配置类型](src/config/types.ts)。文档生成设置放在 CLI 的 `docs.config` 文件中，运行时配置显式传给 `DocsSite`。

## 多语言

`createMessageCatalog` 合并公共中英文文案与业务文案，同名键由业务覆盖。公共界面文案统一维护在 [en.json](src/i18n/en.json) 和 [zh-CN.json](src/i18n/zh-CN.json)。

独立组件也支持传入本地化文案。`MarkdownContent` 和 `HTMLDocumentContent` 未提供的文案键使用公共英文默认值。

## 代码高亮

Markdown 和 HTML 代码块支持 TypeScript、JSON、Bash、纯文本（`text`、`txt`、`plaintext`）和
HTML/XML。显式指定的未知语言按纯文本显示，不产生语言缺失警告。显式的 `nohighlight` 和
`no-highlight` 标记禁用高亮；没有指定语言的代码块保留自动检测。

应用可以在渲染站点前通过 `highlight.js/lib/core` 注册额外语言：

```ts
import hljs from 'highlight.js/lib/core';
import glsl from 'highlight.js/lib/languages/glsl';

hljs.registerLanguage('glsl', glsl);
```

## 开发

```sh
pnpm --filter @galacean/docs-site build
pnpm --filter @galacean/docs-site test
pnpm --filter @galacean/docs-site check:ts
```
