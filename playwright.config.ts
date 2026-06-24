import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  outputDir: 'tests/e2e/results',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm runtime:dev',
      url: 'http://localhost:3141/health',
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter @ninja/forge-console build && pnpm --filter @ninja/forge-console start -p 3001',
      url: 'http://localhost:3001',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});