import { defineConfig, devices } from '@playwright/test';

// Runs against the production build, so it tests what learners get: Pyodide served from our own site.
export default defineConfig({
  testDir: 'e2e',
  // The smoke test for the deployed site has its own config, playwright.live.config.ts.
  testIgnore: 'live/**',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    // Always build afresh: reusing a running preview would test whatever build it serves.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
