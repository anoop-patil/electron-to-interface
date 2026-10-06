import { expect, test, type Response } from '@playwright/test';
import { run, zoomLevel } from '../helpers';

// Runs against the deployed site (playwright.live.config.ts), after each deploy and by hand at launch.

test('a deep link to zoom level 7 loads the app', async ({ page }) => {
  const response = await page.goto('/zoom/7');
  expect(response?.status()).toBe(200);
  await expect(zoomLevel(page, 7, 'CPU instructions')).toContainText('Hello World!');
});

test('Python 3.14.2 runs from our own site, and its files are cached for a year', async ({ page, baseURL }) => {
  const pyodide: Response[] = [];
  page.on('response', (response) => response.url().includes('/pyodide/') && pyodide.push(response));

  await page.goto('/zoom/2');
  await run(page, 'print("Hi")');
  await expect(zoomLevel(page, 2, 'Bytes').getByRole('button', { name: /^Byte / })).toHaveCount(12);
  await expect(page.getByText('Python 3.14.2')).toBeVisible();

  const wasm = pyodide.find((response) => response.url().endsWith('/pyodide.asm.wasm'));
  expect(wasm).toBeDefined();
  expect(new URL(wasm!.url()).origin).toBe(new URL(baseURL!).origin);
  expect(await wasm!.headerValue('content-type')).toBe('application/wasm');
  expect(await wasm!.headerValue('cache-control')).toBe('public, max-age=31536000, immutable');
});
