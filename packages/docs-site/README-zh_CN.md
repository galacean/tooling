# @galacean/docs-site

[English](README.md)

双语文档站点共用的 React 运行时与 TypeDoc 数据契约。

## 安装

在使用该包的 React 应用中安装本包及其 peer dependencies：

```sh
pnpm add @galacean/docs-site react react-dom react-markdown react-router-dom remark-gfm highlight.js
```

## 公共 API

包根路径是唯一受支持的 React 导入入口。通过 `@galacean/docs-site` 导入 `DocsSite`、配置类型、通用文案和站点数据工具，并且只需加载一次 `@galacean/docs-site/index.css`。

`DocsSite` 负责语言重定向、共享站点框架、API/手册路由、按需加载的搜索、canonical/hreflang 链接及 404 状态。调用方提供 `baseURL`、`locales`、`defaultLocale`、`preferenceNamespace`、品牌与运行时配置、本地化产品文案，以及 `renderHome`。请将该组件挂载在应用根部；它会创建自己的 `BrowserRouter`，不要再用另一个路由器包裹。产品字体和首页样式由调用方维护。

`site` 配置包含品牌、语言标签和文案、API 数据配置，也可以提供搜索数据 URL 和规范链接的站点 origin。包根路径还导出 `CopyButton`、`Icon` 和 `useTheme`，供产品首页使用。更底层的 API/手册/搜索页面及布局组件不是公共 API。

`createMessageCatalog` 将通用英文和简体中文界面文案与产品专属文案合并。API 工具提供 manifest/snapshot 校验、reflection 索引与加载；`createManualContentClient` 负责手册导航和文档加载；`normalizeBase` 可用于子路径部署。

## 开发

消费工作区导出前先运行 `pnpm --filter @galacean/docs-site build`；源码变更后也需重新构建。Vite 会将入口、类型声明、按需加载的路由 chunk 和 CSS 构建到 `dist`。

```sh
pnpm --filter @galacean/docs-site test
pnpm --filter @galacean/docs-site check:ts
```
