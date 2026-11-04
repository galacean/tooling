# @galacean/release-tools

[English](README.md)

Galacean 仓库的发布自动化工具，提供 `print-changelog` 和 `update-version` 两个命令。

## 环境与安装

要求 Node.js >=24.0.0。

```sh
pnpm add -D @galacean/release-tools
```

## 生成变更日志

可在目标仓库中执行，也可传入仓库路径：

```sh
pnpm exec print-changelog
pnpm exec print-changelog -- /path/to/repository
```

命令会交互式选择起始 tag，将其与目标分支之间的提交关联到 Pull Request，并输出带链接且标题符合 Conventional Commits 规范的条目。默认通过目标仓库的 `origin` 远端识别 GitHub 仓库，也可设置 `GITHUB_REPOSITORY`。目标分支默认为 `main`，可通过 `CHANGELOG_BASE_BRANCH` 修改。未传入路径参数时，可用 `TARGET_REPOSITORY` 指定目标仓库。

## 更新包版本

```sh
pnpm exec update-version -- --dry-run /path/to/repository
pnpm exec update-version -- /path/to/repository
```

`--dry-run` 会列出具有版本号且非私有的工作区包，不修改文件。正式执行时，命令会交互式选择包和新版本，并更新选中包的 `package.json`。目标默认为当前目录，也可通过 `TARGET_REPOSITORY` 指定。
