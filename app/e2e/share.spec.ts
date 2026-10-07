import { expect, test, type Page } from './test';
import { editor, editorCode } from './helpers';

const runButton = (page: Page) => page.getByRole('button', { name: 'Run', exact: true });
const shareButton = (page: Page) => page.getByRole('button', { name: 'Share', exact: true });
const shareLink = (page: Page) => page.getByRole('textbox', { name: 'Share link' });
const terminal = (page: Page) => page.getByRole('region', { name: 'Terminal' });
const zoomNote = (page: Page) => page.locator('main').getByRole('status');

// Twenty lines, with characters that could go wrong on their way into a URL and back.
const TWENTY_LINES = [
  '# Grüße, 世界 🐍',
  'import math',
  '',
  'def area(r):',
  '    return math.pi * r ** 2',
  '',
  'names = ["Zoë", "José"]',
  'for n in names:',
  '    print(f"{n:>6}|")',
  '',
  'path = "C:\\\\temp"',
  'query = "a=1&b=2#top?x=%20"',
  'print(path, query)',
  'total = 0',
  'while total < 3:',
  '    total += 1',
  'else:',
  '    print("done", total)',
  'print(round(area(2), 2))',
  'print("end")',
].join('\n');

test('a Share link carries a 20-line Program exactly, and opens with it in the editor, waiting for Run', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/zoom/3');
  await editor(page).fill(TWENTY_LINES);
  await shareButton(page).click();

  await expect(page.getByText('Copied a link to your program.')).toBeVisible();
  const link = await shareLink(page).inputValue();
  expect(link).toMatch(/^http:\/\/localhost:4173\/zoom\/1#code=[A-Za-z0-9_-]+$/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  const opened = await context.newPage();
  await opened.goto(link);
  await expect.poll(() => editorCode(opened)).toBe(TWENTY_LINES);
  await expect(zoomNote(opened)).toHaveText(
    'This program came from a Share link. Nothing from a link runs until you click Run, so the zoom view and the Terminal still show the hello world Example.',
  );

  // Python is ready, and still nothing has run.
  await expect(runButton(opened)).toBeEnabled({ timeout: 60_000 });
  await expect(terminal(opened).locator('pre')).toHaveText('Hello World!\n');

  await runButton(opened).click();
  await expect(terminal(opened).locator('pre')).toHaveText('   Zoë|\n  José|\nC:\\temp a=1&b=2#top?x=%20\ndone 3\n12.57\nend\n');
  await expect(zoomNote(opened)).toHaveCount(0);
});

test('the link offered goes once the code changes, since it carries the code as it was', async ({ page }) => {
  await page.goto('/zoom/1');
  await editor(page).fill('print(1)');
  await shareButton(page).click();
  await expect(shareLink(page)).toBeVisible();

  await editor(page).fill('print(2)');
  await expect(shareLink(page)).toHaveCount(0);
});

test('a Share link opened in a tab already showing the page puts its program in the editor', async ({ page }) => {
  await page.goto('/zoom/1');
  await editor(page).fill('print("shared")');
  await shareButton(page).click();
  const link = await shareLink(page).inputValue();

  await page.getByRole('group', { name: 'Examples', exact: true }).getByRole('button', { name: 'for loop' }).click();
  await expect.poll(() => editorCode(page)).not.toBe('print("shared")');
  // Only the fragment differs, so the browser doesn't load the page again.
  await page.goto(link);
  await expect.poll(() => editorCode(page)).toBe('print("shared")');
  await expect(zoomNote(page)).toContainText('still show the for loop Example.');

  // An Example takes the place of the link's Program, so the address stops carrying it.
  await page.getByRole('group', { name: 'Examples', exact: true }).getByRole('button', { name: 'class' }).click();
  await expect(page).toHaveURL(/\/zoom\/1$/);
});

test('a Share link cut short says so, and the editor keeps hello world', async ({ page }) => {
  await page.goto('/zoom/1');
  await editor(page).fill('print("this link will be cut short")');
  await shareButton(page).click();
  const link = await shareLink(page).inputValue();

  const opened = await page.context().newPage();
  await opened.goto(link.slice(0, -10));
  await expect(opened.getByText('This link’s program couldn’t be read. Part of the link may have been lost when it was copied.')).toBeVisible();
  await expect.poll(() => editorCode(opened)).toBe('print("Hello World!")');
});
