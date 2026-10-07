import { expect, test, type Page } from './test';
import { editor, editorCode, run, zoomLevel } from './helpers';

const terminal = (page: Page) => page.getByRole('region', { name: 'Terminal' });
const examples = (page: Page) => page.getByRole('group', { name: 'Examples', exact: true });
const status = (page: Page) => page.getByRole('status').filter({ hasText: /Python|WebAssembly|memory/ });

/** Python never finishes loading: its files never arrive. */
const pythonNeverLoads = (page: Page) => page.route('**/pyodide/**', () => {});

test('hello world shows at once, before Python has loaded, and the learner can type while Run waits', async ({ page }) => {
  await pythonNeverLoads(page);
  await page.goto('/');

  await expect(terminal(page).locator('pre')).toHaveText('Hello World!\n');
  await expect(zoomLevel(page, 1, 'Your code')).toContainText('This Example is 1 line long, and Python ran it when this site was built');
  await expect(examples(page).getByRole('button', { name: 'hello world' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
  await expect(status(page)).toHaveText('Python is loading in your browser. You can type, or try the Examples, while you wait; Run works once it’s ready.');

  // Every zoom level has hello world to show.
  await page.goto('/zoom/5');
  await expect(zoomLevel(page, 5, 'Bytecode')).toContainText('LOAD_NAME');
  await editor(page).fill('print("mine")');
  await expect.poll(() => editorCode(page)).toBe('print("mine")');
  await expect(examples(page).getByRole('button', { name: 'hello world' })).toHaveAttribute('aria-pressed', 'false');
});

test('picking an Example puts its code in the editor and shows it at once, run, before Python has loaded', async ({ page }) => {
  await pythonNeverLoads(page);
  await page.goto('/');

  await examples(page).getByRole('button', { name: 'for loop' }).click();
  await expect.poll(() => editorCode(page)).toBe('total = 0\nfor n in range(1, 4):\n    total = total + n\n    print(n, total)\nprint("Total:", total)');
  await expect(terminal(page).locator('pre')).toHaveText('1 1\n2 3\n3 6\nTotal: 6\n');
  await expect(examples(page).getByRole('button', { name: 'for loop' })).toHaveAttribute('aria-pressed', 'true');
  await expect(examples(page).getByRole('button', { name: 'hello world' })).toHaveAttribute('aria-pressed', 'false');

  for (const [name, printed] of [['function', 'Hello, Ada\nHello, Grace\n'], ['list comprehension', '[4, 2, 2, 6]\nLongest: 6\n'], ['class', 'Rex says woof\nFido says woof\n']]) {
    await examples(page).getByRole('button', { name }).click();
    await expect(terminal(page).locator('pre')).toHaveText(printed);
  }
});

test('the syntax-error Example shows how far Python got, explains the error where the code is and where Python stopped, and says why later levels are empty', async ({ page }) => {
  await pythonNeverLoads(page);
  await page.goto('/');

  await examples(page).getByRole('button', { name: 'syntax error' }).click();
  await expect.poll(() => editorCode(page)).toBe('names = ["Ada", "Grace"]\nfor name in names:\n    print("Hello, name)\nprint("Done")');
  await expect(terminal(page).locator('pre')).toContainText('SyntaxError: unterminated string literal (detected at line 3)');

  // Level 1: the quote mark Python points at is marked in the code and the editor, and the error is explained.
  const code = zoomLevel(page, 1, 'Your code');
  await expect(code).toContainText('Python read it when this site was built and stopped at a syntax error');
  await expect(code.locator('mark')).toHaveText('"');
  await expect(page.locator('.editor-highlight [data-line="3"] mark')).toHaveText('"');
  const explained = code.getByRole('region', { name: 'Line 3: a piece of text has no closing quote mark' });
  await expect(explained).toContainText('SyntaxError: unterminated string literal (detected at line 3)');
  await expect(explained).toContainText('Put the closing quote mark where the text ends.');

  // Level 3: the tokens stop at the bracket before the quote mark, and the error is explained there too.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const tokens = zoomLevel(page, 3, 'Tokens');
  await expect(tokens.getByRole('list', { name: 'Line 3' }).getByRole('button')).toHaveText(['INDENT4 spaces', 'NAMEprint', 'OP(']);
  await expect(tokens.getByRole('list', { name: 'Line 4' })).toHaveCount(0);
  await expect(tokens.getByRole('region', { name: 'Line 3: a piece of text has no closing quote mark' })).toContainText('so the tokens stop short');

  // Levels 4 to 7 say why they have nothing to show.
  for (const [level, title, says] of [
    [4, 'Structure', 'Python never worked out the structure of your program: it stopped at a syntax error at zoom level 3, Tokens.'],
    [5, 'Bytecode', 'Python made no steps from your program: it stopped at a syntax error at zoom level 3, Tokens, before it got this far.'],
    [6, 'The interpreter', 'The interpreter never ran your program'],
    [7, 'CPU instructions', 'None of the interpreter’s handlers ran'],
  ] as const) {
    await page.keyboard.press('ArrowDown');
    await expect(zoomLevel(page, level, title)).toContainText(says);
  }
  await expect(zoomLevel(page, 7, 'CPU instructions').getByRole('button', { name: 'How we know: Observed' })).toBeVisible();
});

test('an Example’s Try it yourself says Python ran the command when the site was built', async ({ page }) => {
  await pythonNeverLoads(page);
  await page.goto('/zoom/7');
  const tryIt = page.getByRole('group').filter({ hasText: 'Try it yourself' });

  await tryIt.locator('summary').click();
  await tryIt.getByRole('tab', { name: 'What you’ll see' }).click();
  await expect(tryIt.getByRole('tabpanel')).toContainText('did what this command does on this Example when this site was built.');
});

test('once Python has loaded, Run shows the learner’s own Program in place of the Example', async ({ page }) => {
  await page.goto('/');
  await expect(terminal(page).locator('pre')).toHaveText('Hello World!\n');

  await run(page, 'print("mine")');
  await expect(terminal(page).locator('pre')).toHaveText('mine\n');
  await expect(zoomLevel(page, 1, 'Your code')).toContainText('You typed 1 line and clicked Run.');
  await expect(examples(page).getByRole('button', { pressed: true })).toHaveCount(0);
});

test('when Python can’t start, Run stays off and every Example still works, with a note', async ({ page }) => {
  await page.route('**/pyodide/**', (route) => route.abort());
  await page.goto('/');

  await expect(status(page)).toHaveText('Python couldn’t start in this browser, so Run is off. The Examples still work: Python ran each one when this site was built.');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
  await examples(page).getByRole('button', { name: 'class' }).click();
  await expect(terminal(page).locator('pre')).toHaveText('Rex says woof\nFido says woof\n');
});

test('a device that reports under 1 GB of memory never loads Python, and gets the Examples with a note', async ({ page }) => {
  const pyodideRequests: string[] = [];
  page.on('request', (request) => request.url().includes('/pyodide/') && pyodideRequests.push(request.url()));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 0.5 }));
  await page.goto('/');

  await expect(status(page)).toHaveText(
    'This device reports less than 1 GB of memory, too little to run Python here, so Run is off. The Examples still work: Python ran each one when this site was built.',
  );
  await examples(page).getByRole('button', { name: 'function' }).click();
  await expect(terminal(page).locator('pre')).toHaveText('Hello, Ada\nHello, Grace\n');
  expect(pyodideRequests).toEqual([]);
});
