# @galacean/docs-site

[English](README.md)

双语文档站点共用的 React 运行时与 TypeDoc 数据契约。

## 安装

在使用该包的 React 应用中安装本包及其 peer dependencies：

```sh
pnpm add @galacean/docs-site react react-dom react-markdown react-router-dom remark-gfm highlight.js
```

## 公共 API

通过 `@galacean/docs-site` 导入 `DocsSite`、配置类型、通用文案和站点数据工具，并且只需加载一次 `@galacean/docs-site/index.css`。

`DocsSite` 负责语言重定向、共享站点框架、API/手册路由、按需加载的搜索、canonical/hreflang 链接及 404 状态。调用方提供 `baseURL`、`locales`、`defaultLocale`、`preferenceNamespace`、品牌与运行时配置、本地化产品文案，以及 `renderHome`。请将该组件挂载在应用根部；它会创建自己的 `BrowserRouter`，不要再用另一个路由器包裹。产品字体和首页样式由调用方维护。

`site` 配置包含品牌、语言标签和文案、API 数据配置，也可以提供 `manualDataURL`、搜索数据 URL 和规范链接的站点 origin。`manualDataURL` 指向包含 `navigation.json` 和语言子目录的公开 URL，默认值为 `${dataBaseURL}data/manual/`。如果 docs-tools 将手册产物写到默认公开目录之外，请将此项配置为服务器实际公开该目录的 URL；搜索产物可通过 `getSearchDataURL` 映射。包根路径还导出 `CopyButton`、`Icon`、`SearchPanel` 和 `useTheme`，供产品页面使用。`SearchPanel` 是懒加载的独立搜索弹窗，调用方提供本地化文案、`loadItems` 和 `navigate(url)` 回调；组件内置 Suspense fallback，不依赖路由上下文，可接入调用方自己的路由系统。

包根路径还导出 API、手册、搜索、共享 UI 和站点组件 barrel 中的组件与类型，适用于高级组合场景。其中 route 和 shell 组件需要调用方提供 React Router 上下文；常规站点集成仍建议使用 `DocsSite`。所有组件均可从 `@galacean/docs-site` 导入。

`createMessageCatalog` 将通用英文和简体中文界面文案与产品专属文案合并。API 工具提供 manifest/snapshot 校验、reflection 索引与加载；`createManualContentClient` 负责手册导航和文档加载；`normalizeBase` 可用于子路径部署。

## 开发

消费工作区导出前先运行 `pnpm --filter @galacean/docs-site build`；源码变更后也需重新构建。Vite 会将入口、类型声明、按需加载的路由 chunk 和 CSS 构建到 `dist`。

```sh
pnpm --filter @galacean/docs-site test
pnpm --filter @galacean/docs-site check:ts
```
