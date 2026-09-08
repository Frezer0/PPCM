import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: 'list',
  globalTeardown: './tests/browser/teardown.mjs',
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'msedge', headless: true, viewport: { width: 1440, height: 1050 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'node server/index.mjs',
    url: 'http://127.0.0.1:4173/api/health',
    timeout: 30000,
    reuseExistingServer: false,
    env: { PORT: '4173', PPCM_DATA_DIR: path.resolve(`test-results/database-${Date.now()}`) },
  },
});
