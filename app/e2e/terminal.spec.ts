import { expect, test, type Page } from '@playwright/test';
import { run } from './helpers';

const terminal = (page: Page) => page.getByRole('region', { name: 'Terminal' });

test('the Terminal shows what hello world printed, labeled Observed', async ({ page }) => {
  await page.goto('/');
  await run(page, 'print("Hello World!")');

  await expect(terminal(page).locator('pre')).toHaveText('Hello World!\n');
  await expect(terminal(page)).toContainText('1 line');
  await expect(terminal(page).getByRole('button', { name: 'How we know: Observed' })).toBeVisible();
});

test('the Terminal shows everything a multi-line Program prints, in order, at every zoom level', async ({ page }) => {
  await page.goto('/');
  await run(page, 'for name in ["Ada", "Grace"]:\n    print("Hello,", name)\nprint("Bye")');

  await expect(terminal(page).locator('pre')).toHaveText('Hello, Ada\nHello, Grace\nBye\n');
  await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();
  await expect(terminal(page).locator('pre')).toHaveText('Hello, Ada\nHello, Grace\nBye\n');
});

test('an error shows what was printed before it, then Python’s traceback', async ({ page }) => {
  await page.goto('/');
  await run(page, 'print("before")\n1 / 0');

  await expect(terminal(page).locator('pre')).toHaveText(/^before\nTraceback \(most recent call last\):\n[^]*ZeroDivisionError: division by zero\n$/);
});

test('a Program that prints nothing says so', async ({ page }) => {
  await page.goto('/');
  await run(page, 'x = 1');

  await expect(terminal(page)).toContainText('Your program printed nothing.');
  await expect(terminal(page).locator('pre')).toHaveCount(0);
});

test('a long run says the record of its steps was cut short', async ({ page }) => {
  await page.goto('/');
  await run(page, 'for i in range(5000):\n    pass\nprint("done")');

  await expect(terminal(page).locator('pre')).toHaveText('done\n');
  await expect(terminal(page)).toContainText('The app records up to 2,000 steps of a run');
});
