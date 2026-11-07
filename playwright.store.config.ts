import { defineConfig } from '@playwright/test';

/** Separate config for generating store screenshots (not part of the test run). */
export default defineConfig({
  testDir: 'tests/store',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/store',
});
