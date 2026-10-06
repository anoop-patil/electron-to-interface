import { expect, test, type Page } from '@playwright/test';
import { anyZoomLevel, run } from './helpers';

const runButton = (page: Page) => page.getByRole('button', { name: 'Run', exact: true });
const terminal = (page: Page) => page.getByRole('region', { name: 'Terminal' });

test('a loop that never ends is stopped after 5 seconds, and Run works again', async ({ page }) => {
  await page.goto('/zoom/1');
  await run(page, 'print("before")');
  const started = Date.now();
  await run(page, 'while True: pass');
  expect(Date.now() - started).toBeGreaterThanOrEqual(5000);

  await expect(page.getByRole('status').filter({ hasText: 'still running after 5 seconds' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  // The zoom view still shows the last Program that finished.
  await expect(terminal(page).locator('pre')).toHaveText('before\n');

  await run(page, 'print("after")');
  await expect(terminal(page).locator('pre')).toHaveText('after\n');
  await expect(page.getByRole('status').filter({ hasText: 'still running after 5 seconds' })).toHaveCount(0);
});

test('while a loop runs, the page still responds', async ({ page }) => {
  await page.goto('/zoom/1');
  await run(page, 'print("before")');
  await page.getByRole('textbox', { name: 'Your program' }).fill('while True: pass');
  await runButton(page).click();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');

  await page.locator('[data-zoom="in"]').click();
  await expect(anyZoomLevel(page, 2)).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
});

test('input() returns an empty string, and a note says so', async ({ page }) => {
  await page.goto('/');
  await run(page, 'name = input("Name? ")\nprint("Hello,", repr(name))');

  await expect(terminal(page).locator('pre')).toHaveText("Name? Hello, ''\n");
  await expect(page.getByRole('status').filter({ hasText: 'Your program asked for input 1 time.' })).toContainText(
    'input() always returns an empty string',
  );
});

test('a line nested too deeply for the Python in the browser is stopped with a plain message, and Run works again', async ({ page }) => {
  await page.goto('/');
  await run(page, `print(${Array(3000).fill('1').join('+')})`);

  await expect(page.getByRole('status').filter({ hasText: 'ran out of room' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await run(page, 'print("after")');
  await expect(terminal(page).locator('pre')).toHaveText('after\n');
});
