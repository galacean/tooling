import galacean from '@galacean/eslint-config';
import browser from '@galacean/eslint-config/browser';
import strict from '@galacean/eslint-config/strict';
import tests from '@galacean/eslint-config/tests';
import { defineConfig } from 'eslint/config';

export default defineConfig([
	galacean,
	{
		...browser[0],
		files: ['packages/docs-site/src/**/*.{ts,tsx}'],
	},
	{
		...strict,
		files: ['packages/*/{src,bin}/**/*.{ts,tsx}'],
	},
	{
		...tests,
		rules: {
			...tests.rules,
			'compat/compat': 'off',
		},
	},
]);
