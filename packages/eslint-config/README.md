# @galacean/eslint-config

[简体中文](README-zh_CN.md)

Shared flat ESLint configuration for Galacean TypeScript repositories.

## Requirements and installation

Use Node.js >=24.0.0, ESLint >=10.2.0, and TypeScript >=5.6.3.

```sh
pnpm add -D @galacean/eslint-config eslint typescript
```

## Configuration

Create or update `eslint.config.mjs` in the consuming repository:

```js
import galacean from '@galacean/eslint-config';

export default galacean;
```

The base config covers JavaScript and TypeScript, applies type-aware TypeScript rules, and ignores dependency, build, coverage, and declaration files.

Optional configs can be composed when needed:

```js
import galacean from '@galacean/eslint-config';
import strict from '@galacean/eslint-config/strict';
import tests from '@galacean/eslint-config/tests';
import browser from '@galacean/eslint-config/browser';

export default [...galacean, strict, tests, ...browser];
```

`/strict` enables additional TypeScript safety rules; `/tests` relaxes selected rules for test and mock files; `/browser` enables browser compatibility checks and declares the `fetch`, `Promise`, and `URL` polyfills. Each optional config is independent. Add file scopes and framework-specific rules in the consuming repository as needed.
