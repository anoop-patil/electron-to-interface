import { expect, test, type Locator, type Page } from '@playwright/test';
import { run, zoomLevel } from './helpers';

const tokens = (page: Page) => zoomLevel(page, 3, 'Tokens');
const chips = (page: Page) => tokens(page).locator('[data-fact-id^="tok-"]');
/** The names chips are read out by, in order. */
const names = (buttons: Locator) => expect.poll(() => buttons.evaluateAll((all) => all.map((button) => button.getAttribute('aria-label'))));

test('hello world is six token chips: NAME, OP, STRING, OP, NEWLINE and ENDMARKER', async ({ page }) => {
  await page.goto('/zoom/3');
  await run(page, 'print("Hello World!")');

  await expect(tokens(page)).toContainText('So it decodes your 22 bytes into text and picks out the meaningful pieces, called tokens.');
  await expect(tokens(page)).toContainText('Your program, line by line, as the 6 tokens Python found.');
  await names(chips(page)).toEqual(['NAME: print', 'OP: (', 'STRING: "Hello World!"', 'OP: )', 'NEWLINE: a newline', 'ENDMARKER: end of the file']);
  await expect(tokens(page)).toContainText('ENCODING comes before line 1: Python’s note that it read your bytes as utf-8.');
});

test('picking a token explains it, where it sits in tokenize’s notation, and its bytes', async ({ page }) => {
  await page.goto('/zoom/3');
  await run(page, 'print("Hello World!")');

  await tokens(page).getByRole('button', { name: 'NAME: print' }).click();
  await expect(tokens(page).getByRole('button', { name: 'NAME: print' })).toHaveAttribute('aria-pressed', 'true');
  await expect(tokens(page).getByRole('heading', { level: 2 })).toHaveText('print is a name');
  await expect(tokens(page)).toContainText('Python has read the letters of print and decided they form one word: a name.');
  await expect(tokens(page)).toContainText('Where: line 1, columns 0 to 4. tokenize writes this as 1,0-1,5. Bytes: 112 114 105 110 116.');

  await tokens(page).getByRole('button', { name: 'OP: (' }).click();
  await expect(tokens(page).getByRole('heading', { level: 2 })).toHaveText('( is punctuation');
  await expect(tokens(page)).toContainText('notes the exact kind: LPAR.');
});

test('a multi-line Program has chips on every line, with the tokens that mark line ends and indentation', async ({ page }) => {
  await page.goto('/zoom/3');
  await run(page, 'def greet(name):\n    print("Hello,", name)\n\nfor person in ["Ada", "Grace"]:\n    greet(person)');

  for (let line = 1; line <= 6; line++) await expect(tokens(page).getByRole('list', { name: `Line ${line}` })).toBeVisible();
  await expect(tokens(page).getByRole('list', { name: 'Line 2' }).getByRole('button').first()).toHaveAccessibleName('INDENT: 4 spaces');
  await names(tokens(page).getByRole('list', { name: 'Line 3' }).getByRole('button')).toEqual(['NL: a newline']);
  await names(tokens(page).getByRole('list', { name: 'Line 6' }).getByRole('button')).toEqual(['DEDENT: block ends', 'ENDMARKER: end of the file']);

  await tokens(page).getByRole('list', { name: 'Line 3' }).getByRole('button').click();
  await expect(tokens(page).getByRole('heading', { level: 2 })).toHaveText('A line with no code');
  await tokens(page).getByRole('button', { name: 'NAME: def' }).click();
  await expect(tokens(page).getByRole('heading', { level: 2 })).toHaveText('def is a keyword');
});

test('a token over several lines gets one row for all of them', async ({ page }) => {
  await page.goto('/zoom/3');
  await run(page, 's = """one\ntwo\nthree"""\nprint(s)');

  await names(tokens(page).getByRole('list', { name: 'Lines 1 to 3' }).getByRole('button')).toEqual(['NAME: s', 'OP: =', 'STRING: """one\ntwo\nthree"""', 'NEWLINE: a newline']);
  await expect(tokens(page)).toContainText('lines 1–3');
  await names(tokens(page).getByRole('list', { name: 'Line 4' }).getByRole('button')).toEqual(['NAME: print', 'OP: (', 'NAME: s', 'OP: )', 'NEWLINE: a newline']);
});

test('Try it yourself runs python -m tokenize on the Program and explains its lines', async ({ page }) => {
  await page.goto('/zoom/3');
  await run(page, 'print("Hello World!")');

  const tryIt = page.getByRole('group').filter({ hasText: 'Try it yourself' });
  await expect(tryIt.locator('summary')).toHaveText('Try it yourselfpython -m tokenize program.py');
  await tryIt.locator('summary').click();
  await tryIt.getByRole('tab', { name: 'What you’ll see' }).click();
  await expect(tryIt.locator('pre')).toContainText("1,0-1,5:            NAME           'print'");
  await expect(tryIt.getByRole('button', { name: 'How we know: Observed' })).toBeVisible();

  await tryIt.getByRole('tab', { name: 'How to read it' }).click();
  await expect(tryIt.getByRole('tabpanel')).toContainText('Line 1, columns 0 to 4. In each pair, the first number is the line and the second is the column.');
});

test('the Machine map lights RAM: the Program, now read as tokens', async ({ page }) => {
  await page.goto('/zoom/3');
  await run(page, 'print("Hello World!")');

  await expect(page.getByRole('region', { name: 'Your computer' }).locator('[aria-current="true"]')).toHaveAccessibleName(/^RAM .*your program · read as 6 tokens$/);
});
