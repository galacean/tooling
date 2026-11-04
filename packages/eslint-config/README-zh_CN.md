# @galacean/eslint-config

[English](README.md)

Galacean TypeScript 仓库共用的 ESLint 扁平配置。

## 环境与安装

要求 Node.js >=24.0.0、ESLint >=10.2.0 和 TypeScript >=5.6.3。

```sh
pnpm add -D @galacean/eslint-config eslint typescript
```

## 配置

在使用方仓库创建或修改 `eslint.config.mjs`：

```js
import galacean from '@galacean/eslint-config';

export default galacean;
```

基础配置覆盖 JavaScript 和 TypeScript，启用基于类型信息的 TypeScript 规则，并忽略依赖、构建、覆盖率及声明文件。

按需组合可选配置：

```js
import galacean from '@galacean/eslint-config';
import strict from '@galacean/eslint-config/strict';
import tests from '@galacean/eslint-config/tests';
import browser from '@galacean/eslint-config/browser';

export default [...galacean, strict, tests, ...browser];
```

`/strict` 启用额外的 TypeScript 安全规则；`/tests` 放宽测试和 mock 文件的部分规则；`/browser` 启用浏览器兼容性检查，并声明 `fetch`、`Promise` 和 `URL` polyfill。各可选配置相互独立，可只引入需要的部分。文件匹配范围和框架专属规则由使用方按需配置。
