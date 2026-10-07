// Imports Playwright's own test, not ../test: these tests make the page break its Content Security Policy on purpose.
import { expect, test } from '@playwright/test';
import { ELSEWHERE, pythonWorker, tryToFetch } from '../helpers';

// Runs against the deployed site, so it checks the headers Cloudflare Pages sends from public/_headers.

test('on the deployed site, the page and the worker that runs the learner’s code can’t fetch from other sites', async ({ page }) => {
  await page.goto('/zoom/1');
  expect(await page.evaluate(tryToFetch, ELSEWHERE)).toBe('refused by connect-src');

  const worker = await pythonWorker(page);
  expect(await worker.evaluate(tryToFetch, '/examples/hello.json')).toBe('fetched');
  expect(await worker.evaluate(tryToFetch, ELSEWHERE)).toBe('refused by connect-src');
  expect(await worker.evaluate(tryToFetch, 'https://cloudflareinsights.com/cdn-cgi/rum')).toBe('refused by connect-src');
});
