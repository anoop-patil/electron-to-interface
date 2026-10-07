// Imports Playwright's own test, not ./test: these tests make the page break its Content Security Policy on purpose.
import { expect, test } from '@playwright/test';
import { ELSEWHERE, pythonWorker, run, tryToFetch } from './helpers';

test('the page can fetch from our own site, and not from any other', async ({ page }) => {
  const response = await page.goto('/zoom/1');
  expect(response?.headers()['content-security-policy']).toContain("connect-src 'self' https://cloudflareinsights.com;");

  expect(await page.evaluate(tryToFetch, '/examples/hello.json')).toBe('fetched');
  expect(await page.evaluate(tryToFetch, ELSEWHERE)).toBe('refused by connect-src');
});

test('the worker that runs the learner’s code can fetch only from our own site, not even from Web Analytics', async ({ page }) => {
  const script = page.waitForResponse(/\/assets\/worker\/worker-.*\.js$/);
  await page.goto('/zoom/1');
  // Two policies; the browser enforces both.
  expect((await script).headers()['content-security-policy']).toMatch(/, script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'$/);
  const worker = await pythonWorker(page);

  expect(await worker.evaluate(tryToFetch, '/examples/hello.json')).toBe('fetched');
  expect(await worker.evaluate(tryToFetch, ELSEWHERE)).toBe('refused by connect-src');
  expect(await worker.evaluate(tryToFetch, 'https://cloudflareinsights.com/cdn-cgi/rum')).toBe('refused by connect-src');
});

test('a Program that imports js stops, and the page says js is blocked here', async ({ page }) => {
  await page.goto('/zoom/1');
  await run(page, `import js\njs.fetch("${ELSEWHERE}")`);

  await expect(page.getByRole('status').filter({ hasText: 'because it imports js, which is blocked here' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Terminal' })).toContainText("ModuleNotFoundError: js is blocked here, so a program can't use your browser");
});
