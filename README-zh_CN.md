# Galacean Tooling

[English](README.md)

Galacean 仓库共用的开发配置与发布工具。

## 安装

本工作区使用 Node.js 22+（`eslint-plugin-compat` 的要求）和 pnpm 10.33.2。

```sh
corepack enable
pnpm install
pnpm check
```

若未安装 Corepack，先执行 `npm install --global corepack`。首次使用时，Corepack 会下载项目指定的 pnpm 版本。

## 开发

在仓库根目录执行：

| 命令 | 说明 |
| --- | --- |
| `pnpm check:ts` | 对 `packages/` 下定义了 `check:ts` 的包执行类型检查。 |
| `pnpm lint` | 检查仓库代码。 |
| `pnpm check` | 执行以上两项检查。 |

## 发布工具

在本工作区执行：

```sh
pnpm print-changelog -- /path/to/repository
pnpm update-version -- /path/to/repository
pnpm update-version -- --dry-run /path/to/repository
```

也可安装到其他仓库：

```sh
pnpm add -D @galacean/release-tools
pnpm exec print-changelog
pnpm exec update-version
```

`print-changelog` 根据 Pull Request 生成变更日志；`update-version` 更新所选的非私有且已有版本号的工作区包。`--dry-run` 仅列出可更新的包，不修改文件。运行前无需构建。

目标仓库默认为当前目录，可通过路径参数或 `TARGET_REPOSITORY` 指定。变更日志支持以下环境变量：

| 变量 | 默认值 |
| --- | --- |
| `GITHUB_REPOSITORY` | 从目标仓库的 `origin` 推断，格式为 `owner/repository`。 |
| `CHANGELOG_BASE_BRANCH` | `main` |

## ESLint 配置

适用于 ESLint 9 和 TypeScript 的共享扁平配置：

```sh
pnpm add -D @galacean/eslint-config eslint typescript
```

配置 ESLint：

```js
import galacean from '@galacean/eslint-config';

export default galacean;
```

可选导入：`@galacean/eslint-config/strict`（类型安全）、`/tests`（测试规则调整）和 `/browser`（浏览器兼容性）。文件匹配范围、框架规则及浏览器 polyfill 由使用方配置。
