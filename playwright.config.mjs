import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH
  ? resolve(process.env.CHROMIUM_EXECUTABLE_PATH)
  : undefined;
const proxyServer = process.env.PLAYWRIGHT_PROXY || process.env.HTTPS_PROXY;

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8080',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === '1',
    proxy: proxyServer ? { server: proxyServer, bypass: '127.0.0.1,localhost' } : undefined,
    launchOptions: {
      executablePath,
      args: executablePath ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] : []
    },
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'desktop-chromium', use: { viewport: { width: 1672, height: 941 } } },
    {
      name: 'mobile-chromium',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    }
  ],
  webServer: {
    command: 'npm run serve',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
