#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const entrypoint = resolve(dirname(fileURLToPath(import.meta.url)), '../src/update-version/index.ts');
const result = spawnSync(process.execPath, [tsxCli, entrypoint, ...process.argv.slice(2)], {
	stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
