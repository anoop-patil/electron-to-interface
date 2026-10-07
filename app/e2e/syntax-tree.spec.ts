import { expect, test, type FrameLocator, type Locator, type Page } from './test';
import { run, zoomLevel } from './helpers';

const GREET = 'def greet(name):\n    print("Hello,", name)\n\nfor person in ["Ada", "Grace"]:\n    greet(person)';

const structure = (page: Page | FrameLocator) => zoomLevel(page, 4, 'Structure');
/** The boxes on screen, by the names they are read out by, in order. */
const names = (boxes: Locator) =>
  expect.poll(() => boxes.evaluateAll((all) => all.filter((box) => box.checkVisibility()).map((box) => box.getAttribute('aria-label'))));
const boxes = (page: Page) => structure(page).locator('[data-fact-id^="ast-"]');

/** The boxes a box sits inside, from the nearest out, by the names they are read out by. */
const holders = (box: Locator) =>
  box.evaluate((button) => {
    const found: string[] = [];
    for (let parent = button.parentElement; parent; parent = parent.parentElement) {
      const label = parent.querySelector(':scope > button[data-fact-id]');
      if (label && label !== button) found.push(label.getAttribute('aria-label')!);
    }
    return found;
  });

test('hello world is a Module holding one statement, a call to print with a fixed value', async ({ page }) => {
  await page.goto('/zoom/4');
  await run(page, 'print("Hello World!")');

  await expect(structure(page)).toContainText('So Python works out the structure: which pieces belong together');
  await expect(structure(page)).toContainText('Your program as the 5 boxes Python made, each inside the box that holds it.');
  await names(boxes(page)).toEqual(['Module: Your program', 'Expr: One statement', 'Call: Call a function', 'Name: print (What to call)', 'Constant: Hello World! (What to give it)']);
  expect(await holders(structure(page).getByRole('button', { name: 'Name: print (What to call)' }))).toEqual([
    'Call: Call a function',
    'Expr: One statement',
    'Module: Your program',
  ]);
  await expect(structure(page)).toContainText('Where did the brackets go?');
});

test('picking a box explains its role', async ({ page }) => {
  await page.goto('/zoom/4');
  await run(page, 'print("Hello World!")');

  const call = structure(page).getByRole('button', { name: 'Call: Call a function' });
  await call.click();
  await expect(call).toHaveAttribute('aria-pressed', 'true');
  await expect(structure(page).getByRole('heading', { level: 2 })).toHaveText('Call a function');
  await expect(structure(page)).toContainText('A call has two parts: what to call, and what to give it. This one calls print.');

  await structure(page).getByRole('button', { name: 'Constant: Hello World! (What to give it)' }).click();
  await expect(structure(page).getByRole('heading', { level: 2 })).toHaveText('What to give it');
  await expect(structure(page)).toContainText('The quote marks are gone; they only marked where the text starts and ends.');
  await expect(call).toHaveAttribute('aria-pressed', 'false');
});

test('a multi-line Program shows the whole tree, with each body inside its function or loop', async ({ page }) => {
  await page.goto('/zoom/4');
  await run(page, GREET);

  const holdersOf = (name: string) => holders(structure(page).getByRole('button', { name, exact: true }));
  expect(await holdersOf('Name: print (What to call)')).toEqual(['Call: Call a function', 'Expr: One statement', 'FunctionDef: Define a function: greet', 'Module: Your program']);
  expect(await holdersOf('Name: greet (What to call)')).toEqual(['Call: Call a function', 'Expr: One statement', 'For: A loop', 'Module: Your program']);
  expect(await holdersOf('arg: name (One input)')).toEqual(['arguments: What it takes', 'FunctionDef: Define a function: greet', 'Module: Your program']);

  await structure(page).getByRole('button', { name: 'For: A loop' }).click();
  await expect(structure(page)).toContainText('It has a name each item gets (person), something to go through (["Ada", "Grace"]) and what to do each time (1 statement).');
});

test('on a phone, the tree is an indented outline', async ({ page }) => {
  // Headless Chromium won't lay a page out narrower than about 490px, so the app goes in a frame 390px wide.
  await page.goto('/zoom/1');
  await page.setContent('<iframe src="/zoom/4" style="width:390px; height:844px; border:0"></iframe>');
  const frame = page.frameLocator('iframe');
  await run(frame, GREET);

  const outline = structure(frame).getByRole('list', { name: 'Your program’s structure' });
  await expect(outline).toBeVisible();
  const module = (await outline.getByRole('button', { name: 'Module: Your program' }).boundingBox())!;
  const print = (await outline.getByRole('button', { name: 'Name: print (What to call)' }).boundingBox())!;
  expect(print.x).toBeGreaterThan(module.x + 40);
  expect(print.x + print.width).toBeLessThanOrEqual(390);

  await outline.getByRole('button', { name: 'Name: print (What to call)' }).click();
  await expect(structure(frame).getByRole('heading', { level: 2 })).toHaveText('What to call');
});

test('Try it yourself runs python -m ast on the Program and explains its boxes', async ({ page }) => {
  await page.goto('/zoom/4');
  await run(page, 'print("Hello World!")');

  const tryIt = page.getByRole('group').filter({ hasText: 'Try it yourself' });
  await expect(tryIt.locator('summary')).toHaveText('Try it yourselfpython -m ast program.py');
  await tryIt.locator('summary').click();
  await tryIt.getByRole('tab', { name: 'What you’ll see' }).click();
  await expect(tryIt.locator('pre')).toContainText("func=Name(id='print', ctx=Load()),");
  await expect(tryIt.getByRole('button', { name: 'How we know: Observed' })).toBeVisible();

  await tryIt.getByRole('tab', { name: 'How to read it' }).click();
  await expect(tryIt.getByRole('tabpanel')).toContainText("Name(id='print', ctx=Load())");
  await expect(tryIt.getByRole('tabpanel')).toContainText('The indentation shows which box sits inside which.');
});

test('a Program with a syntax error has no tree, and level 4 says why', async ({ page }) => {
  await page.goto('/zoom/4');
  await run(page, 'print("Hi"');

  await expect(structure(page)).toContainText('Python never worked out the structure of your program: it stopped at a syntax error at zoom level 3, Tokens.');
  await expect(boxes(page)).toHaveCount(0);
});

test('a syntax error Python found while working out the structure is explained at level 4, with the place it points at marked', async ({ page }) => {
  await page.goto('/zoom/4');
  await run(page, 'for i in range(3)\n    print(i)');

  const panel = structure(page).getByRole('region', { name: 'Line 1: a colon is missing' });
  await expect(panel).toContainText("SyntaxError: expected ':'");
  await expect(panel).toContainText('A line that starts a block, such as one beginning with for, if, while, def or class, ends with a colon');
  // The colon belongs where the newline is.
  await expect(panel.locator('mark')).toHaveText('↵');
  await expect(page.locator('.editor-highlight mark')).toHaveText('↵');
});

test('a long expression on one line nests too deep to draw in full, and says so', async ({ page }) => {
  // Analyzing 1,200 terms takes Pyodide a few seconds.
  test.setTimeout(60_000);
  await page.goto('/zoom/4');
  await run(page, `print(${Array(1200).fill('1').join('+')})`);

  await expect(structure(page)).toContainText('Your program as the 2403 boxes Python made', { timeout: 20_000 });
  // The page draws 24 levels of boxes; the box at the bottom says how many are inside it.
  await expect(structure(page)).toContainText('Not drawn: the 2356 boxes inside this one. Your program’s tree is too deep to draw in full.');
  await expect(page.getByRole('region', { name: 'Terminal' })).toContainText('1200');
});

test('the Machine map lights RAM: the Program, now as boxes', async ({ page }) => {
  await page.goto('/zoom/4');
  await run(page, 'print("Hello World!")');

  await expect(page.getByRole('region', { name: 'Your computer' }).locator('[aria-current="true"]')).toHaveAccessibleName(/^RAM .*your program · as 5 boxes, temporary$/);
});
