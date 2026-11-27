# @galacean/docs-tools

[English](README.md)

生成 API 数据、同步本地或语雀手册、构建搜索索引与静态路由的 CLI。要求 Node.js 24+。

## 安装与配置

在文档站点仓库根目录安装并执行命令：

```sh
pnpm add -D @galacean/docs-tools
```

创建 `site/docs.config.json`（也支持 TypeScript 和 JavaScript 文件）：

```json
{
  "siteName": "Example Docs",
  "sourceLocale": "en",
  "locales": ["en", "zh-CN"],
  "api": {
    "dataDirectory": "site/public/data/api",
    "repository": "https://github.com/example/project.git",
    "versions": ["1.3.0"],
    "packages": [{
      "key": "engine",
      "name": "@example/engine",
      "directory": "packages/engine",
      "tsconfig": "tsconfig.json",
      "entries": [{ "key": "root", "source": "src/index.ts", "types": "dist/index.d.ts" }],
      "readme": { "files": { "en": "README.md", "zh-CN": "README.zh-CN.md" } }
    }]
  },
  "manual": {
    "dataDirectory": "site/public/data/manual",
    "collections": [{
      "key": "guides",
      "source": { "type": "local", "directory": "site/manual", "locale": "en" }
    }]
  }
}
```

`sourceLocale` 和 `locales` 必填，按需配置 `api` 与 `manual`。语雀来源和其他选项见[配置字段定义](src/config/types.ts)；`tokenEnv` 填写保存语雀 Token 的环境变量名。

`dataBaseUrls` 可声明位于 `data/` 之前的 `production`、`development` 发布前缀。业务选择地址，CLI 生成本地文件后由业务发布。浏览器配置单独传给 `@galacean/docs-site`。

## 命令

`--config` 放在其他参数之前，路径相对于仓库根目录：

```sh
pnpm exec galacean-docs api generate --config site/docs.config.json
pnpm exec galacean-docs search build --config site/docs.config.json
pnpm exec galacean-docs --help
```

| 命令 | 用途 |
| --- | --- |
| `api generate` | 默认生成最新配置 SemVer 版本；`--version <tag>` 选择其他版本，`--force` 强制重建。 |
| `api extract` / `api apply` | 提取 API 注释翻译任务并应用译文。 |
| `api status` | 检查 API 生成与译文归档状态。 |
| `api translations migrate` | 从现有 API 快照导入完整译文。 |
| `manual sync` | 同步本地或语雀手册集合。 |
| `manual translations migrate` | 通过 `<collection> <locale> <legacy-dir>` 映射导入旧译文。 |
| `package-readmes build` | 生成多语言包 README 数据。 |
| `search build` | 根据 API、README 和手册构建索引。 |
| `routes build` | 前端构建后生成静态路由。 |
| `skills sync` | 安装内置翻译 skill。 |

`routes build` 需要配置 `siteName`，并读取 `site/dist/index.html`。子路径部署设置 `SITE_BASE_PATH`，生成完整 canonical URL 时设置 `VITE_SITE_ORIGIN`。

## 翻译与语言选择

公共界面内置英文、简体/繁体中文、日语、韩语、德语、葡萄牙语、西班牙语、法语、土耳其语、阿拉伯语、俄语、乌克兰语、泰语。项目的 `locales` 决定启用语言，并可通过 `i18n` 扩展其他语言定义与字典。规范化后重复的语言 ID、冲突的语言映射键会报错。

安装或校验两个内置 skill：

```sh
pnpm exec galacean-docs skills sync
pnpm exec galacean-docs skills sync --check
```

[API 翻译](skills/api-documentation-translation/SKILL.md)与[手册/README 翻译](skills/manual-documentation-translation/SKILL.md)在用户未指定时提供源语言选择、目标多选与全选；已明确的选择直接执行。`all` 仅指当前配置语言，并按每份文档排除其实际源语言。各手册集合、README 的源语言可以与 API 项目不同。

```sh
pnpm exec galacean-docs api locales sync --config <config>
pnpm exec galacean-docs api extract --config <config> --source-locale en --target-locales ja,ko,de --dry-run
pnpm exec galacean-docs manual extract --config <config> --source-locale all --target-locales all
pnpm exec galacean-docs package-readmes extract --config <config> --target-locales all
pnpm exec galacean-docs translations status --config <config>
pnpm exec galacean-docs translations check --config <config> --require-complete
```

`api extract` 默认选择最新配置版本，历史版本需指定 `--version`。`--packages`、`--collections`、`--pages` 分别限制相应类型的资源范围。`--locale` 保留为单目标别名，与 `--target-locales` 互斥。`--dry-run` 不创建任务。`api locales sync` 从已验证模型补齐语言入口，不重建历史源码；模型损坏仍会失败。

API apply 沿用现有结果格式。新任务的 `reusableTranslations` 根据归档中的逐字段源文指纹生成，合并这些值与新译字段形成完整结果；字段 key 相同不代表源文未变。

Manual/README 结果包含 `locale`、`sourceHash`、译文 `content`、`title`、`group`。结果保存到任务旁，再用 `manual apply` 或 `package-readmes apply` 提交 task/result 对。工具校验 Markdown 保护语法、HTML 标签树/属性、代码、占位符及内部标题锚点。显式维护的目标文件优先，需要直接维护，archive apply 不覆盖它们。

持久正文与提交元数据位于 `<translationDirectory>/translation-cache/manual/` 或 `package-readmes/`；API 归档位于 `translation-cache/api/`。临时任务分别位于 `api-translation/`、`manual-translation/`、`package-readmes-translation/`。清理生成数据时保留 `translation-cache`，临时 CI 工作区也需恢复/保存它。`translationDirectory` 默认为 `tmp/docs-tools`。

新增语言无需预建空手册文件：生成时使用有效归档或带标识的原文回退。缺少匹配源文元数据的旧手册归档保留供复核，不自动当作最新译文。apply 后执行项目自己的手册/README、搜索及静态路由构建命令。发布要求完整覆盖时使用 `translations check --require-complete`。工具不会自动调用翻译服务、发布文档或部署站点。

## 开发

```sh
pnpm --filter @galacean/docs-tools test
pnpm --filter @galacean/docs-tools check:ts
```

## routePaths

```json
{
  "routePaths": {
    "home": "/help/:locale/",
    "manual": "/help/:locale/guides/",
    "api": "/reference/:locale/"
  }
}
```

该配置只用于独立站点的路径、静态页面、sitemap 和语言替代链接。搜索索引保存文档目标，嵌入应用通过 href 生成链接。

静态页面仅在 `pages` 显式声明 `{ "slug": null }` 时生成独立首页；只接入手册或 API 时无需声明首页。
