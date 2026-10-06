import { expect, test, type Page } from '@playwright/test';
import { editor, editorCode, run, zoomLevel } from './helpers';

const runButton = (page: Page) => page.getByRole('button', { name: 'Run', exact: true });
const terminal = (page: Page) => page.getByRole('region', { name: 'Terminal' });
const outOfDate = (page: Page) => page.locator('main').getByRole('status');
const pythonReady = (page: Page) => expect(runButton(page)).toBeEnabled({ timeout: 60_000 });

test('the editor indents after a colon, and Run runs what was typed', async ({ page }) => {
  await page.goto('/zoom/1');
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('for i in range(2):\nprint(i)');
  await expect.poll(() => editorCode(page)).toBe('for i in range(2):\n    print(i)');

  await pythonReady(page);
  await runButton(page).click();
  await expect(terminal(page).locator('pre')).toHaveText('0\n1\n');
});

test('nothing is analyzed while typing; editing after a Run marks the zoom view out of date until the next Run', async ({ page }) => {
  await page.goto('/zoom/1');
  await run(page, 'print("one")');
  await expect(outOfDate(page)).toHaveCount(0);

  await editor(page).fill('print("two")');
  await expect(outOfDate(page)).toHaveText('You’ve changed your program since it ran, so the zoom view shows it as it was. Click Run to zoom into the new version.');
  await expect(terminal(page).locator('pre')).toHaveText('one\n');
  await expect(zoomLevel(page, 1, 'Your code')).toContainText('print("one")');

  await runButton(page).click();
  await expect(terminal(page).locator('pre')).toHaveText('two\n');
  await expect(outOfDate(page)).toHaveCount(0);
});

test('over 20 lines, a message says so and Run stays off until the Program fits', async ({ page }) => {
  await page.goto('/zoom/1');
  await pythonReady(page);
  const lines = Array.from({ length: 21 }, (_, at) => `n${at} = ${at}`);

  await editor(page).fill(lines.join('\n'));
  await expect(page.getByText('Your program is 21 lines long. A program here can have up to 20, so Run is off until you take out 1 line.')).toBeVisible();
  await expect(runButton(page)).toBeDisabled();

  await editor(page).fill(lines.slice(1).join('\n'));
  await expect(page.getByText(/lines long/)).toHaveCount(0);
  await expect(runButton(page)).toBeEnabled();
});

test('an uploaded file goes into the editor without running, and its name, made safe to type, goes into the commands', async ({ page }) => {
  await page.goto('/zoom/1');
  await page.locator('input[type="file"]').setInputFiles({ name: 'my program.py', mimeType: 'text/x-python', buffer: Buffer.from('print("from a file")\r\nprint(2)\r\n') });

  await expect.poll(() => editorCode(page)).toBe('print("from a file")\nprint(2)');
  await expect(page.getByText('Loaded “my program.py”. The Try it yourself commands call it my_program.py')).toBeVisible();
  // Not run: the zoom view still shows hello world, and says it is out of date.
  await expect(terminal(page).locator('pre')).toHaveText('Hello World!\n');
  await expect(outOfDate(page)).toBeVisible();

  await pythonReady(page);
  await runButton(page).click();
  await expect(terminal(page).locator('pre')).toHaveText('from a file\n2\n');
  await expect(page.locator('summary code')).toHaveText('python my_program.py');
  await expect(page.getByText(/^Loaded /)).toHaveCount(0);

  // An Example isn't the uploaded file, so its commands use program.py again.
  await page.getByRole('group', { name: 'Examples', exact: true }).getByRole('button', { name: 'for loop' }).click();
  await expect(page.locator('summary code')).toHaveText('python program.py');
});

test('importing a package outside the standard library explains that only the standard library is available', async ({ page }) => {
  await page.goto('/zoom/1');
  await run(page, 'import math\nimport numpy');

  await expect(page.getByText('Your program stopped on line 2 because it imports numpy, which isn’t part of Python’s standard library.')).toContainText(
    'Only the standard library is available here',
  );
  await expect(terminal(page).locator('pre')).toContainText("ModuleNotFoundError: No module named 'numpy'");

  await run(page, 'import math\nprint(math.pi)');
  await expect(page.getByText(/standard library/)).toHaveCount(0);
});
