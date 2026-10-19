# Galacean Tooling

[简体中文](README-zh_CN.md)

Shared development and release tools for Galacean repositories.

## Setup

Use Node.js 22+ for this workspace (`eslint-plugin-compat` requires it) and pnpm 10.33.2.

```sh
corepack enable
pnpm install
pnpm check
```

If Corepack is missing, run `npm install --global corepack` first. Corepack downloads the project's pinned pnpm version on first use.

## Development

Run from the repository root:

| Command | Description |
| --- | --- |
| `pnpm check:ts` | Type-check packages under `packages/` that define `check:ts`. |
| `pnpm lint` | Lint the repository. |
| `pnpm check` | Run both checks. |


## Release Tools

Run from this workspace:

```sh
pnpm print-changelog -- /path/to/repository
pnpm update-version -- /path/to/repository
pnpm update-version -- --dry-run /path/to/repository
```

Or install in another repository:

```sh
pnpm add -D @galacean/release-tools
pnpm exec print-changelog
pnpm exec update-version
```

`print-changelog` generates a changelog from pull requests; `update-version` updates selected, non-private workspace packages with a version field. `--dry-run` only lists eligible packages. No build is required.

The target defaults to the current directory. Set it with a positional path or `TARGET_REPOSITORY`. Changelog options:

| Variable | Default |
| --- | --- |
| `GITHUB_REPOSITORY` | Inferred from the target's `origin` remote (`owner/repository`). |
| `CHANGELOG_BASE_BRANCH` | `main` |

## ESLint Config

Shared flat configuration for ESLint 9 and TypeScript:

```sh
pnpm add -D @galacean/eslint-config eslint typescript
```

Configure ESLint:

```js
import galacean from '@galacean/eslint-config';

export default galacean;
```

Optional imports: `@galacean/eslint-config/strict` (type safety), `/tests` (test overrides), and `/browser` (browser compatibility). Keep file scopes, framework rules, and browser polyfills in the consuming project's configuration.
