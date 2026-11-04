# @galacean/docs-tools

[English](README.md)

为文档站点仓库生成和维护文档数据的命令行工具。受支持的公共接口是 `galacean-docs` 可执行文件；本包不提供可供 Node.js 导入的 TypeScript API。

在维护文档站点的仓库中将其作为开发依赖安装：

```sh
pnpm add -D @galacean/docs-tools
```

从目标仓库根目录执行命令，并传入站点配置：

```sh
pnpm exec galacean-docs api generate --config site/site.config.ts
pnpm exec galacean-docs api extract --config site/site.config.ts path/to/api-snapshot.json
pnpm exec galacean-docs api apply --config site/site.config.ts path/to/task.json path/to/translation.json
pnpm exec galacean-docs package-readmes build --config site/site.config.ts
pnpm exec galacean-docs search build --config site/site.config.ts
pnpm exec galacean-docs routes build --config site/site.config.ts
pnpm exec galacean-docs skills sync --config site/site.config.ts
```

配置文件可以是 JSON、JavaScript 或 TypeScript 模块。它声明源语言、支持的语言、API 数据目录；API 生成还需要声明包及 TypeDoc 入口。`api generate` 可在配置了多个包时追加包 key；`api extract` 接受一个或多个快照路径；`api apply` 接受一个或多个任务文件与译文文件对。`skills sync` 支持 `--check`，只检查同步状态而不写入。静态路由构建可通过 `SITE_BASE_PATH` 和 `VITE_SITE_ORIGIN` 指定部署路径和站点 origin。运行 `pnpm exec galacean-docs --help` 查看命令概要。

TypeScript 实现随包发布，用于 CLI 和内部测试。使用方应调用 CLI，而不是导入内部模块。
