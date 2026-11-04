# @galacean/release-tools

[简体中文](README-zh_CN.md)

Release automation utilities for Galacean repositories. The package provides two executables: `print-changelog` and `update-version`.

## Requirements and installation

Use Node.js >=24.0.0.

```sh
pnpm add -D @galacean/release-tools
```

## Print a changelog

Run from the target repository or pass its path:

```sh
pnpm exec print-changelog
pnpm exec print-changelog -- /path/to/repository
```

The command prompts for a starting tag, compares commits through the configured base branch, and prints linked pull requests with conventional titles. It uses the target repository's `origin` remote to identify the GitHub repository unless `GITHUB_REPOSITORY` is set. The base branch defaults to `main` and can be changed with `CHANGELOG_BASE_BRANCH`. `TARGET_REPOSITORY` sets the target path when no positional path is provided.

## Update package versions

```sh
pnpm exec update-version -- --dry-run /path/to/repository
pnpm exec update-version -- /path/to/repository
```

The dry run lists workspace packages that have a version and are not private. Without `--dry-run`, the command prompts for packages and a new version, then updates the selected `package.json` files. The target defaults to the current directory and can also be set with `TARGET_REPOSITORY`.
