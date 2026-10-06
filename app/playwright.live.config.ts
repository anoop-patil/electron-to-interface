import { defineConfig, devices } from '@playwright/test';

// The smoke test for the deployed site: LIVE_URL=https://electrontointerface.com npx playwright test --config playwright.live.config.ts
const baseURL = process.env.LIVE_URL;
if (!baseURL) throw new Error('Set LIVE_URL to the site to test, such as https://electrontointerface.com');

export default defineConfig({
  testDir: 'e2e/live',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  // A cold edge cache can make the first Pyodide download slow.
  retries: 1,
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
