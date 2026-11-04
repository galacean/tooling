import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: [
			{
				find: '@galacean/docs-site',
				replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
			},
		],
	},
});
