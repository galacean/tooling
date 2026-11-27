# @galacean/docs-site

[English](README.md)

多语言 API 与手册文档站点的 React 运行时，提供搜索、主题和语言切换。

## 安装

```sh
pnpm add @galacean/docs-site react react-dom react-markdown remark-gfm highlight.js
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

`DocsSite` 自带 `BrowserRouter`，应挂载在其他 Router 之外。在应用入口显式导入一次 `@galacean/docs-site/index.css`。

- 首页使用 `slug: null`，普通页面还需提供各语言的 `title`。使用 `bindDocsSitePages` 时，首页渲染函数使用键 `/`，普通页面使用各自的 slug。如果没有名为 `home` 的页面，首页也可使用键 `home`。
- `manual`：`true` 使用默认数据目录，`false` 关闭手册，`{ dataURL }` 指定独立目录。
- `api`：提供 `DocsSiteAPIOptions<Locale>` 后开启 API 页面。
- `dataBaseURL`：位于 `data/` 之前的发布前缀，默认使用 `baseURL`。业务选择本地或 CDN 地址，并将生成数据发布到该位置。

完整选项见[配置类型](src/config/types.ts)。文档生成设置放在 CLI 的 `docs.config` 文件中，运行时配置显式传给 `DocsSite`。

## 集成到已有应用

应用决定当前页面、语言和 URL。标准手册数据源读取导航、概览和正文。

```tsx
import { Manual, createManualSource } from '@galacean/docs-site';
import type { ManualProps } from '@galacean/docs-site';
import '@galacean/docs-site/index.css';

const source = createManualSource({ baseURL: '/published/', locales: ['en', 'zh-CN'] });

const href: ManualProps['href'] = ({ locale, slug, anchor }) => {
  const query = new URLSearchParams({ lang: locale });
  if (slug !== undefined) query.set('doc', slug);
  return '/help?' + query + (anchor ? '#' + encodeURIComponent(anchor) : '');
};

export function Guide({ locale, slug }: { locale: string; slug?: string }) {
  return <Manual source={source} locale={locale} slug={slug} href={href} />;
}
```

接入应用路由时传入 navigation={{ location, navigate }}。默认使用普通链接。messages 接受部分内置文案覆盖。SiteShell 通过普通 children 提供语言、导航和主题，并跟随标题与侧栏状态。按需传入 languages、search 和 metadata。

API 使用 createAPISource({ baseURL, locales, repository? })。给 API 组件传 source、locale、selection 和 href。selection 包含 packageKey、version、entryKey 和可选的原始 symbol。省略 selection 显示包列表。href 接收区分 API 首页、包和符号的目标对象，成员锚点位于 anchor。onPackageChange 和 onVersionChange 由宿主决定如何更新选中项。

createDocsSearch({ baseURL, locales, manual: href }) 可以直接传给 SiteShell 的 search。启用 API 搜索时提供 api 链接函数。搜索产物保存文档目标，URL 由应用生成。DocsSite 为独立站点提供一套可选的路由和布局。

使用 `SiteShell` 时，Logo 复用菜单中 `key: 'home'` 的目标地址。省略该菜单项时，Logo 指向 `/`。独立站点和静态 404 页的首页链接指向部署根路径。

独立站点的 Router 随 DocsSite 按需加载。自定义站点页面可用 DocsLink 在站内导航。

## 多语言

内置公共界面语言：`en`、`zh-CN`、`zh-TW`、`ja`、`ko`、`de`、`pt`、`es`、`fr`、`tr`、`ar`、`ru`、`uk`、`th`。项目通过 `locales` 启用其中的子集；升级依赖不会自动扩大发布语言。

```ts
import { builtInLocales, createMessageCatalog } from '@galacean/docs-site';

const { locales, messages } = createMessageCatalog(builtInLocales);
// 也可只启用部分语言：createMessageCatalog(['en', 'ja', 'ar'] as const)。
```

公共界面、通用手册介绍和符号计数均有内置文案，不必提供空业务字典。新增业务键必须覆盖所有启用语言；业务文案覆盖同名公共键。`localeLabels` 为可选覆盖，默认计数按语言处理数字与复数。

构建配置和运行时使用同一份 `locales`。语言工具函数与类型统一从 `@galacean/docs-site` 主入口导入，该入口也可在 Node 中加载；浏览器 API 在对应功能执行时访问，不在模块初始化时访问。内容语言使用规范 BCP 47 标签；README 显式文件映射仍可使用带下划线的文件名。

可选 `i18n.localeDefinitions` 定义语言标签、方向及脚本，`i18n.commonMessages` 覆盖公共文案或补充其他语言的完整字典。将同一选项传入 `createMessageCatalog(locales, productMessages, i18n)` 及 `DocsSite` 配置。语言匹配区分简繁书写系统；`getCommonMessageIssues(locale, i18n)` 可检查自定义字典缺项。

站点导航时同步设置 `html.lang` 与 `html.dir`。阿拉伯语采用 RTL 布局，代码与签名保留 LTR 隔离。手册缺译时显示原文提示并保留正文真实语言；API 注释和 README 也保留来源语言。日期、搜索规范化和语言菜单使用对应 locale。静态元信息复用相同规则；有覆盖元数据时，纯原文回退正文不列为已翻译的语言替代页。

独立使用 Markdown、HTML、图片查看器组件时可传文案覆盖，未配置站点的独立组件使用英文默认值。

## 样式定制

在应用入口引入一次 `@galacean/docs-site/index.css`。页面样式作用于 `.docs-root`，可在该元素上覆盖 CSS 变量。例如，`--site-link` 控制链接颜色，`--site-accent` 控制焦点和选中态颜色。深色主题可通过 `.docs-root[data-theme='dark']` 单独设置。

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
