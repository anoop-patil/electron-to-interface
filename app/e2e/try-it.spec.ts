import { expect, test, type Page } from '@playwright/test';
import { gauge, run, zoomLevel } from './helpers';

const BYTES_COMMAND = `python -c "print(list(open('program.py', 'rb').read()))"`;

const tryIt = (page: Page) => page.getByRole('group').filter({ hasText: 'Try it yourself' });

test('Try it yourself starts as one row with the command for program.py, and opens on three tabs', async ({ page }) => {
  await page.goto('/');
  await run(page, 'print("Hello World!")');

  const section = tryIt(page);
  await expect(section.locator('summary')).toHaveText('Try it yourselfpython program.py');
  await expect(section.getByRole('tab')).toBeHidden();

  await section.locator('summary').click();
  await expect(section.getByRole('tab')).toHaveText(['What it does', 'What you’ll see', 'How to read it']);
  await expect(section.getByRole('tab', { name: 'What it does' })).toHaveAttribute('aria-selected', 'true');
  await expect(section.getByRole('tabpanel')).toContainText('Start Python. On Windows you can also type py.');

  await section.getByRole('tab', { name: 'What you’ll see' }).click();
  await expect(section.getByRole('tabpanel').locator('pre')).toHaveText('Hello World!\n');
  await expect(section.getByRole('tabpanel')).toContainText('Your browser’s Python did what this command does, on your program, just now.');
  await expect(section.getByRole('button', { name: 'How we know: Observed' })).toBeVisible();

  await section.getByRole('tab', { name: 'How to read it' }).click();
  await expect(section.getByRole('tabpanel')).toContainText('Then your file holds the same 22 bytes that zoom level 2 shows.');
});

test('level 2’s command prints the Program’s bytes, and the section stays open on the same tab between levels', async ({ page }) => {
  await page.goto('/');
  await run(page, 'if True:\n    print("Hi")');

  await tryIt(page).locator('summary').click();
  await tryIt(page).getByRole('tab', { name: 'What you’ll see' }).click();
  await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();

  const section = tryIt(page);
  await expect(zoomLevel(page, 2, 'Bytes')).toBeVisible();
  await expect(section.locator('summary code')).toHaveText(BYTES_COMMAND);
  await expect(section.getByRole('tab', { name: 'What you’ll see' })).toHaveAttribute('aria-selected', 'true');
  await expect(section.getByRole('tabpanel').locator('pre')).toHaveText(
    '[105, 102, 32, 84, 114, 117, 101, 58, 10, 32, 32, 32, 32, 112, 114, 105, 110, 116, 40, 34, 72, 105, 34, 41, 10]\n',
  );

  await section.getByRole('tab', { name: 'How to read it' }).click();
  const rows = section.getByRole('row');
  await expect(rows).toHaveText([
    '105, 102, 32, 84, 114, 117, 101, 58, 10line 1: if True:, then the newline, 10',
    '32, 32, 32, 32, 112, 114, 105, 110, 116, 40, 34, 72, 105, 34, 41, 10line 2: 4 spaces, then print("Hi"), then the newline, 10',
  ]);

  // Closing it here closes it on level 1 too.
  await section.locator('summary').click();
  await page.getByRole('button', { name: 'Back: Your code' }).click();
  await expect(zoomLevel(page, 1, 'Your code')).toBeVisible();
  await expect(tryIt(page).getByRole('tab')).toBeHidden();
});

test('the arrow keys move between the tabs', async ({ page }) => {
  await page.goto('/');
  await run(page, 'print("Hi")');
  await tryIt(page).locator('summary').click();

  await tryIt(page).getByRole('tab', { name: 'What it does' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(':focus')).toHaveAccessibleName('What you’ll see');
  await expect(tryIt(page).getByRole('tab', { name: 'What you’ll see' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator(':focus')).toHaveAccessibleName('How to read it');
  // Left and right don't change the zoom level.
  await expect(zoomLevel(page, 1, 'Your code')).toBeVisible();
});

test('Copy puts the command on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await run(page, 'print("Hi")');
  await tryIt(page).locator('summary').click();

  await tryIt(page).getByRole('button', { name: 'Copy' }).click();
  await expect(tryIt(page).getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('python program.py');
});

test('a Program that stops with an error shows Python’s traceback, and how to read it', async ({ page }) => {
  await page.goto('/');
  await run(page, 'print("before")\nprint(1 / 0)');
  await tryIt(page).locator('summary').click();

  await tryIt(page).getByRole('tab', { name: 'What you’ll see' }).click();
  await expect(tryIt(page).locator('pre')).toHaveText(
    'before\nTraceback (most recent call last):\n  File "/home/pyodide/program.py", line 2, in <module>\n    print(1 / 0)\n          ~~^~~\nZeroDivisionError: division by zero\n',
  );
  await tryIt(page).getByRole('tab', { name: 'How to read it' }).click();
  await expect(tryIt(page).getByRole('tabpanel')).toContainText('Your program stopped with an error.');
});

test('a Program that prints nothing says so, and zoom levels that aren’t built yet have no Try it yourself', async ({ page }) => {
  await page.goto('/');
  await run(page, 'x = 1');
  await tryIt(page).locator('summary').click();
  await tryIt(page).getByRole('tab', { name: 'What you’ll see' }).click();
  await expect(tryIt(page).getByRole('tabpanel')).toContainText('Nothing: your program doesn’t print anything');
  await expect(tryIt(page).locator('pre')).toHaveCount(0);

  await gauge(page).getByRole('button', { name: '3 Tokens' }).click();
  await expect(zoomLevel(page, 3, 'Tokens')).toBeVisible();
  await expect(tryIt(page)).toHaveCount(0);
});
