import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tools/browser',
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8766',
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-chromium', use: { browserName: 'chromium', launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    } } },
    { name: 'mobile-webkit', use: { browserName: 'webkit' } },
  ],
  webServer: [{
    command: 'python3 -m http.server 8766 --bind 127.0.0.1 --directory build/browser',
    url: 'http://127.0.0.1:8766',
    reuseExistingServer: false,
    timeout: 20_000,
    stdout: 'ignore',
    stderr: 'ignore',
  }, {
    command: 'python3 -m http.server 8767 --bind 127.0.0.1 --directory web',
    url: 'http://127.0.0.1:8767',
    reuseExistingServer: false,
    timeout: 20_000,
    stdout: 'ignore',
    stderr: 'ignore',
  }],
});
