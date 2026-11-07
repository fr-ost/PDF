import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  define: { __APP_VERSION__: JSON.stringify('test'), __DEV_BUILD__: 'false' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
  },
});
