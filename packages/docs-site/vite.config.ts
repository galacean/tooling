import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dts from 'unplugin-dts/vite';
import { defineConfig } from 'vite';
import packageJSON from './package.json' with { type: 'json' };

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(packageRoot, 'src');
const peerDependencies = Object.keys(packageJSON.peerDependencies ?? {});

export default defineConfig({
  plugins: [dts({
    tsconfigPath: path.join(packageRoot, 'tsconfig.build.json'),
    entryRoot: sourceRoot,
    outDirs: [path.join(packageRoot, 'dist')],
  })],
  build: {
    outDir: path.join(packageRoot, 'dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: false,
    lib: {
      entry: path.join(sourceRoot, 'index.ts'),
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'index',
    },
    rolldownOptions: {
      external: id => peerDependencies.some(dependency => id === dependency || id.startsWith(`${dependency}/`)),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        codeSplitting: true,
      },
    },
  },
});
