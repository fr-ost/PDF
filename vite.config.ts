import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildManifest } from './scripts/manifest.ts';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string };

/** Emits manifest.json into the bundle so it always matches package.json. */
function extensionManifest(development: boolean): Plugin {
  return {
    name: 'unique-pdf:manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(buildManifest({ version: pkg.version, development }), null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const development = mode === 'development';
  return {
    base: '/',
    plugins: [react(), tailwindcss(), extensionManifest(development)],
    resolve: {
      alias: { '@': resolve(import.meta.dirname, 'src') },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __DEV_BUILD__: JSON.stringify(development),
    },
    worker: {
      format: 'es',
    },
    build: {
      outDir: development ? 'dist-dev' : 'dist',
      emptyOutDir: true,
      target: 'chrome120',
      sourcemap: development,
      minify: !development,
      // Chrome supports modulepreload natively; the polyfill would be dead code.
      modulePreload: { polyfill: false },
      chunkSizeWarningLimit: 2500,
      reportCompressedSize: false,
      rolldownOptions: {
        input: {
          app: resolve(import.meta.dirname, 'app.html'),
          popup: resolve(import.meta.dirname, 'popup.html'),
          options: resolve(import.meta.dirname, 'options.html'),
          background: resolve(import.meta.dirname, 'src/background/index.ts'),
        },
        output: {
          entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    server: {
      port: 5173,
      strictPort: false,
    },
  };
});
