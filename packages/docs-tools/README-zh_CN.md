# @galacean/docs-tools

[English](README.md)

用于生成 API 数据、同步手册、构建搜索索引和静态路由，并提供文档翻译 skill 的命令行工具。要求 Node.js 24 或更高版本。

## 安装与配置

在文档站点仓库中安装，并从仓库根目录执行命令：

```sh
pnpm add -D @galacean/docs-tools
```

创建 JSON、JavaScript 或 TypeScript 站点配置。`sourceLocale` 和 `locales` 为必填项；根据站点数据来源配置 `api` 和 `manual`。

```ts
export default {
  siteName: '示例文档站',
  sourceLocale: 'en',
  locales: ['en', 'zh-CN'],
  api: {
    dataDirectory: 'site/public/data/api',
    repository: 'https://github.com/example/project.git',
    versions: ['1.2.3', '1.3.0'],
    packages: [{
      key: 'engine',
      name: '@example/engine',
      directory: 'packages/engine',
      tsconfig: 'tsconfig.json',
      entries: [{ key: 'root', source: 'src/index.ts', types: 'dist/index.d.ts' }],
      readme: { files: { en: 'README.md', 'zh-CN': 'README.zh-CN.md' } },
    }],
  },
  manual: {
    dataDirectory: 'site/public/data/manual',
    collections: [{
      key: 'guides',
      source: { type: 'local', directory: 'site/manual', locale: 'en' },
      translations: { 'zh-CN': 'site/manual-translations/zh-CN' },
    }],
  },
};
```

`api.packages[].entries` 声明公开的 TypeScript 入口。`api.repository` 和 `api.versions` 指定 `api generate` 使用的 Git 仓库和 SemVer 版本。如果配置版本与所有 API 包本地 `package.json` 中的版本一致，就从当前工作树构建，不拉取 Git tag；其他版本则从对应 Git tag 构建。手册集合可使用本地 Markdown 或 Yuque；`tokenEnv` 填写存放 Yuque Token 的环境变量名，不要把 Token 写进配置。

## 命令

`--config` 路径相对于仓库根目录：

| 命令 | 用途 |
| --- | --- |
| `api generate` | 根据配置版本生成 API 快照和 manifest；本地包版本匹配时使用当前工作树。 |
| `api extract` / `api apply` | 提取 API 注释翻译任务并写入译文。 |
| `manual sync` | 同步配置的本地和 Yuque 手册集合。 |
| `package-readmes build` | 生成多语言包 README 数据。 |
| `search build` | 根据 API、README 和手册构建多语言索引。 |
| `routes build` | 前端构建后生成静态路由。 |
| `skills sync` | 将两个内置 skill 安装到 `.agents/skills`。 |

示例：

```sh
pnpm exec galacean-docs api generate --config site/docs.config.ts
pnpm exec galacean-docs manual sync --config site/docs.config.ts
pnpm exec galacean-docs search build --config site/docs.config.ts
pnpm exec galacean-docs skills sync
```

`routes build` 读取 `site/dist/index.html`。部署在子路径时设置 `SITE_BASE_PATH`；需要生成完整 canonical URL 时设置 `VITE_SITE_ORIGIN`。命令参数可通过 `pnpm exec galacean-docs --help` 查看。

## 翻译 Skills

本包提供 [api-documentation-translation](skills/api-documentation-translation/SKILL.md) 和 [manual-documentation-translation](skills/manual-documentation-translation/SKILL.md)。使用前先同步到消费仓库：

```sh
pnpm exec galacean-docs skills sync
pnpm exec galacean-docs skills sync --check
```

第一条命令将 skill 文件写入 `.agents/skills`；`--check` 只校验、不写入，可用于 CI。之后请在 coding agent 对话中指定要使用的 skill，提供站点配置路径、目标语言和翻译范围，并附上相关文件或说明目标包/集合。不要在提示词中提供凭证。

### API 文档翻译

此 skill 仅处理 TypeDoc API 快照中的注释，不用于手册、任意 JSON 或源码注释。示例：“使用 `api-documentation-translation`，根据 `site/docs.config.ts` 将 `engine` 当前 API 快照翻译为 `zh-CN`。”

Skill 会读取 API 数据目录和 manifest，据此选择目标包、版本及语言，并从 manifest 记录的 wrapper 路径提取任务：

```sh
pnpm exec galacean-docs api extract --config <docs-config> <snapshot-wrapper-path>
```

翻译任务中的全部字段，并在任务文件旁生成 JSON。复制任务中的 `locale`、`version` 和 `sourceHash`，将译文放入 `translations` 对象，键必须使用任务中原样的 `key`。占位符必须原样保留；不要翻译标识符、签名、类型、URL、锚点或代码 token。使用以下命令应用译文：

```sh
pnpm exec galacean-docs api apply --config <docs-config> <task.json> <translation.json>
```

同一模型和语言的相关任务尽量一起应用。任务过期或校验失败时重新提取；不要手动修改 wrapper 或内容寻址快照。应用后按仓库文档重新生成数据和搜索索引。

### 手册文档翻译

此 skill 处理配置在手册集合中的 Markdown 页面，不处理 API 快照。示例：“使用 `manual-documentation-translation`，根据 `site/docs.config.ts` 将 `guides` 集合翻译为 `zh-CN`；保留路由 slug，并列出需要复核的页面。”

Skill 会根据集合配置读取源目录和译文目录。源文件位于 `<source directory>/<locale>/<slug>.md`；配置了 `translations[targetLocale]` 时，将译文按目标路由 slug 写入该目录。源目录与生成目录共用时，只编辑 `navigation.json` 中标记为 `source: { type: 'local' }` 的条目。并在对应的导航文件中更新本地化 `title` 和 `group`。

保留 Markdown 结构、代码、标识符、链接、图片、front matter 和文件名。修改已有译文前先与源文比较，需复核的变化应明确报告，不要静默覆盖。完成后检查链接、锚点、资源、占位符和代码围栏。Yuque 集合的翻译与刷新远端内容是分开的；翻译过程中不要主动请求远端内容，也不要调用机器翻译 API。最后执行仓库文档规定的手册同步、搜索构建和校验命令。
