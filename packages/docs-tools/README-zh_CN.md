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

## 翻译

安装内置 skill 后，在 coding agent 中指定配置路径、目标语言和目标包或集合：

```sh
pnpm exec galacean-docs skills sync
pnpm exec galacean-docs skills sync --check
```

- [api-documentation-translation](skills/api-documentation-translation/SKILL.md)：通过 extract/apply 翻译 TypeDoc 快照注释。
- [manual-documentation-translation](skills/manual-documentation-translation/SKILL.md)：翻译 Markdown 或 HTML 手册，保留原格式和路由。

Skill 安装到 `.agents/skills`，`--check` 只校验、不写入。持久译文保存在 `<translationDirectory>/translation-cache/`，`translationDirectory` 默认为 `tmp/docs-tools/`。清理生成数据时保留该缓存。迁移命令保留已有归档，删除旧目录前先检查跳过项。

## 开发

```sh
pnpm --filter @galacean/docs-tools test
pnpm --filter @galacean/docs-tools check:ts
```
