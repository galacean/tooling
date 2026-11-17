# @galacean/docs-site

[English](README.md)

双语 API 与手册文档站点使用的 React 运行时。

## 安装

在消费站点的 React 应用中安装本包及其 peer dependencies：

```sh
pnpm add @galacean/docs-site react react-dom react-markdown react-router-dom remark-gfm highlight.js
```

## 使用

从 `@galacean/docs-site` 导入 `DocsSite` 和配置类型，并且只需加载一次 `@galacean/docs-site/index.css`。将 `DocsSite` 挂载在应用根部；它会创建自己的 `BrowserRouter`。

调用方提供站点品牌、支持语言、本地化文案、API 数据配置和 `pages` 注册表。页面包含 `slug`、`render(locale)`；除首页外还需提供本地化的 `title(locale)`。首页的 `slug` 为 `null`。产品页面内容和字体样式由应用维护。

API 和手册数据以静态文件形式发布。`manualDataURL` 默认是 `${dataBaseURL}data/manual/`；手册发布到其他 URL 时需显式配置。搜索索引发布在非默认 URL 时，通过 `getSearchDataURL` 指定。

## 导出内容

本包还导出 `CopyButton`、`Icon`、`SearchPanel`、`useTheme`、文案目录工具、API/手册数据客户端、路由工具和组件 barrel。`SearchPanel` 不依赖路由上下文，调用方传入本地化文案、`loadItems` 函数和 `navigate` 回调即可使用。路由与站点框架组件需要 React Router 上下文。

## 开发

```sh
pnpm --filter @galacean/docs-site build
pnpm --filter @galacean/docs-site test
pnpm --filter @galacean/docs-site check:ts
```
