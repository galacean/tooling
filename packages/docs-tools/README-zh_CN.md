# @galacean/docs-tools

[English](README.md)

`@galacean/docs-tools` 是供文档站点仓库使用的命令行工具，用于生成 API 文档数据、整理翻译任务、构建搜索索引和静态路由，并同步本工具维护的翻译技能。

受支持的公共接口是 `galacean-docs` 命令。本包不提供供其他 Node.js 程序导入的 TypeScript API。运行环境要求 Node.js 24 或更高版本。

## 安装与运行

在维护文档站点的仓库中安装为开发依赖：

```sh
pnpm add -D @galacean/docs-tools
```

从该仓库根目录执行命令。每条命令都必须通过 `--config` 指定站点配置；配置路径相对于当前工作目录解析：

```sh
pnpm exec galacean-docs api generate --config site/site.config.ts
pnpm exec galacean-docs package-readmes build --config site/site.config.ts
pnpm exec galacean-docs search build --config site/site.config.ts
pnpm exec galacean-docs routes build --config site/site.config.ts
pnpm exec galacean-docs skills sync --config site/site.config.ts
```

配置可以是 JSON、JavaScript 或 TypeScript 模块。最少需要声明源语言、支持的语言和 API 数据目录：

```ts
export default {
  siteName: 'Example Docs',
  sourceLocale: 'en',
  locales: ['en', 'zh-CN'],
  api: {
    dataDirectory: 'site/public/data/api',
    packages: [
      {
        key: 'engine',
        name: '@example/engine',
        directory: 'packages/engine',
        tsconfig: 'tsconfig.json',
        entries: [
          { key: 'root', source: 'src/index.ts', types: 'dist/index.d.ts' },
        ],
      },
    ],
  },
  packageReadmes: {
    engine: {
      en: 'packages/engine/README.md',
      'zh-CN': 'packages/engine/README.zh-CN.md',
    },
  },
};
```

`api.packages` 用于 API 生成：`key` 是文档数据中的稳定标识，`name` 必须与包的 `package.json` 一致，`directory` 指向包目录，`tsconfig` 指向包内 TypeScript 配置。每个 `entries` 项配置一个公开入口；`types` 用于确定导出的声明，`source` 用于关联源码。可选的 `api.typedocOptions` 和 `api.sourceLinkTemplate` 分别传递 TypeDoc 选项和源码链接模板。

`packageReadmes` 将 API 包 key 映射到各语言的 README 路径。缺少某种语言的路径，或该语言文件不存在时，会回退到 README 源语言。`packageReadmeSourceLocales` 可为个别包指定不同于 `sourceLocale` 的 README 源语言。`translationWorkDirectory` 默认为 `tmp/docs-tools/api-translation`。配置中的数据目录、包目录和文件路径必须位于仓库内。

## 命令

### `api generate`

```sh
pnpm exec galacean-docs api generate --config site/site.config.ts [package-key...]
```

读取已配置包的版本和 TypeScript 声明，构建声明文件，再由 TypeDoc 生成反射数据；工具按配置的公开入口筛选导出，并组装各语言的 API 快照和 manifest。快照按内容哈希存储，包和版本对应的 JSON 文件引用共享快照；manifest 记录当前版本、保留版本及入口信息。已有历史中的有效译文会被保留，未翻译字段使用源语言文本，并在命令结果中报告回退警告。

不提供包 key 时生成所有配置包。提供一个或多个 key 时只更新这些包，未选择包的 manifest 项及仍被引用的快照保持不变；更新后不再被任何保留版本引用的有效 sidecar 会自动删除。首次生成必须包含全部配置包。该命令要求每个包的 `package.json`、`tsconfig`、源码入口和声明入口均可读取。

### `api extract`

```sh
pnpm exec galacean-docs api extract --config site/site.config.ts <target-snapshot>...
```

为一个或多个待翻译的 API 目标快照提取译文任务。目标路径必须位于配置的 API 数据目录中，格式为 `<package-key>/<version>/<locale>.api.json`，且语言必须是已配置的非源语言。工具读取同版本的源语言快照，提取需要翻译的注释字段及其占位 token，并把任务写入 `translationWorkDirectory` 下新建的运行目录。终端会列出任务路径、字段数、包版本和目标语言。

此命令只生成任务，不调用机器翻译服务，也不修改 API 快照。翻译流程应保留任务中的字段 key 和 token 信息，并在同一运行目录内为每个任务准备对应的译文 JSON。`api apply` 会按“任务文件、译文文件”的顺序接收这些文件。

### `api apply`

```sh
pnpm exec galacean-docs api apply --config site/site.config.ts \
  <task.json> <translation.json> [<task.json> <translation.json> ...]
```

将一组译文结果写回对应的 API 快照。每个译文文件应包含 `locale`、`version`、`sourceHash` 和 `translations` 字典，例如：

```json
{
  "locale": "zh-CN",
  "version": "1.2.3",
  "sourceHash": "<task 中的 sourceHash>",
  "translations": {
    "<field-key>": "译文"
  }
}
```

任务文件和译文文件必须来自 `translationWorkDirectory` 下的同一个运行目录。应用前会重新读取当前源和目标快照，核对配置、哈希、字段和 token，拒绝应用到已经变化的内容，并验证译文结构。通过校验后，工具会合并同一 TypeDoc 模型和目标语言下已有及本批译文，写入一个新的内容寻址快照，并将 manifest 中所有匹配的包/版本/语言索引更新为同一 `$ref`，同时更新关联的快照标识。仍被保留版本引用的旧快照保持不变；失去所有引用的有效 sidecar 会自动删除。成功后会删除已应用的任务和译文文件。每组文件必须成对提供，可一次应用多组。对同一模型和语言的多个包，建议在同一批次应用；此前已应用导致索引变化时，旧任务会被判定为过期，需重新提取。

### `api snapshots clean`

```sh
pnpm exec galacean-docs api snapshots clean --config site/site.config.ts
```

删除未被 manifest 中任何保留版本引用的内容寻址快照。工具会校验快照文件名与内容 hash；坏 hash 文件会跳过，manifest、索引或引用无效时会终止。该命令只扫描 `api/snapshots/` 顶层的 hash 命名普通文件，不清理 wrapper、临时文件或其他目录。`api generate` 和 `api apply` 在成功更新 manifest 后也会自动清理。

### `package-readmes build`

```sh
pnpm exec galacean-docs package-readmes build --config site/site.config.ts
```

读取 API manifest 中的包列表，根据 `packageReadmes` 配置读取各包 README，并按站点支持的语言输出 JSON 数据到 API 数据目录的同级 `package-readmes/<package-key>/<locale>.json`。未配置或缺失的本地化 README 使用该包的源 README，因此每个 manifest 中的包都必须有源 README 映射。命令输出各语言生成的 README 数量。

### `search build`

```sh
pnpm exec galacean-docs search build --config site/site.config.ts
```

为每种语言构建 `search/<locale>.json`。数据来源包括当前 API 快照中的公开符号及成员、包 README，以及 `manual/navigation.json` 列出的手册页面。索引包含名称、摘要、关键词和站内 URL；README 未翻译时也会按配置回退到源语言。构建需要有效的 API manifest、对应快照、README 配置和各语言手册内容。

### `routes build`

```sh
SITE_BASE_PATH=/docs/ \
VITE_SITE_ORIGIN=https://docs.example.com \
pnpm exec galacean-docs routes build --config site/site.config.ts
```

在站点前端已构建到 `site/dist` 后，为首页、手册页、API 包页和公开 API 符号页生成静态 HTML 路由。工具基于 `site/dist/index.html` 生成各路由的入口文件，并写入 `routes.json`、`404.html` 和 `.nojekyll`；存在站点 origin 时还会添加 canonical 与多语言 alternate 链接。构建期间会检查搜索索引是否指向已生成路由、手册链接和资源是否有效。

`SITE_BASE_PATH` 用于部署在子路径时设置 URL 前缀，默认是 `/`；`VITE_SITE_ORIGIN` 是可选的站点 origin，用于生成完整 canonical 和语言切换 URL。该命令要求配置 `siteName`，并依赖已构建的 `site/dist/index.html`、API manifest、手册导航和搜索索引。

### `skills sync`

```sh
pnpm exec galacean-docs skills sync --config site/site.config.ts
pnpm exec galacean-docs skills sync --config site/site.config.ts --check
```

将本工具随包发布的 `api-documentation-translation` 技能同步到仓库的 `.agents/skills/api-documentation-translation`。同步清单会记录包版本和文件哈希；如果目标目录不是由本工具管理，或受管理文件被手动修改，命令会拒绝覆盖。`--check` 只检查目标是否与当前包版本一致，不写入文件；不一致时以错误退出。

## 推荐流水线

首次构建或更新站点数据时，通常按以下顺序执行：

1. 运行 `api generate`，生成 API 快照和 manifest。
2. 如需更新 API 注释译文，运行 `api extract`，完成翻译后运行 `api apply`。
3. 运行 `package-readmes build` 和 `search build`，生成 README 数据和搜索索引。
4. 使用站点自身的构建命令生成 `site/dist`，再运行 `routes build`。
5. 如仓库使用翻译技能，运行 `skills sync`；CI 可用 `--check` 验证同步状态。

查询命令语法：

```sh
pnpm exec galacean-docs --help
```

TypeScript 实现随包发布，仅供 CLI 和内部测试使用。使用方应调用 `galacean-docs` CLI，而不是导入内部模块。
