import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:3211', headless: true, screenshot: 'only-on-failure', trace: 'off' },
  reporter: [['list']],
  webServer: { command:'npx tsx tests/mock-server.ts', url:'http://127.0.0.1:3211/api/state', reuseExistingServer:false, timeout:30000 },
});
