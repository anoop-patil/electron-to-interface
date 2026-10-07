import { expect, test, type Page } from './test';
import { editor, gauge, run, zoomLevel } from './helpers';

const GREET = 'def greet(name):\n    print("Hello,", name)\n\nfor person in ["Ada", "Grace"]:\n    greet(person)';

/** The parts of the editor's code that are highlighted. `editor-highlight` is a hook for the tests, not a style. */
const highlights = (page: Page) => page.locator('.editor-highlight mark');
const highlightsOnLine = (page: Page, line: number) => page.locator(`.editor-highlight [data-line="${line}"] mark`);
const selected = (page: Page, number: number, title: string) => zoomLevel(page, number, title).locator('[data-fact-id][aria-pressed="true"]').filter({ visible: true });
const zoomIn = (page: Page) => page.locator('[data-zoom="in"]').click();
const zoomOut = (page: Page) => page.locator('[data-zoom="out"]').click();

test('a byte of print leads to its token, its box and the step that finds print, and back', async ({ page }) => {
  await page.goto('/zoom/2');
  await run(page, 'print("Hello World!")');

  // The third byte, i.
  await zoomLevel(page, 2, 'Bytes').locator('[data-fact-id="byte-2"]').click();
  await expect(highlights(page)).toHaveText(['i']);

  await zoomIn(page);
  await expect(selected(page, 3, 'Tokens')).toHaveAccessibleName('NAME: print');
  await expect(zoomLevel(page, 3, 'Tokens').getByRole('heading', { level: 2 })).toHaveText('print is a name');
  await expect(highlights(page)).toHaveText(['print']);

  await zoomIn(page);
  await expect(selected(page, 4, 'Structure')).toHaveAccessibleName('Name: print (What to call)');
  await expect(highlights(page)).toHaveText(['print']);

  await zoomIn(page);
  await expect(selected(page, 5, 'Bytecode')).toHaveText(/LOAD_NAME 0/);
  await expect(zoomLevel(page, 5, 'Bytecode').getByRole('heading', { level: 2 })).toHaveText('Find print');
  await expect(highlights(page)).toHaveText(['print']);

  // Zooming back keeps what the learner picked: the same byte, not the first byte of the token.
  await zoomOut(page);
  await zoomOut(page);
  await zoomOut(page);
  await expect(selected(page, 2, 'Bytes')).toHaveAttribute('data-fact-id', 'byte-2');
  await zoomOut(page);
  await expect(zoomLevel(page, 1, 'Your code').locator('mark')).toHaveText('i');
});

test('picking at one level selects the closest match at the others', async ({ page }) => {
  await page.goto('/zoom/5');
  await run(page, 'print("Hello World!")');

  // Call print with 1 thing, from the whole call.
  await zoomLevel(page, 5, 'Bytecode').getByRole('button', { name: /CALL 1/ }).click();
  await expect(highlights(page)).toHaveText(['print("Hello World!")']);
  await zoomOut(page);
  await expect(selected(page, 4, 'Structure')).toHaveAccessibleName('Call: Call a function');
  await zoomOut(page);
  await expect(selected(page, 3, 'Tokens')).toHaveAccessibleName('NAME: print');

  // A token outside every statement is in the Module.
  await zoomLevel(page, 3, 'Tokens').getByRole('button', { name: 'NEWLINE: a newline' }).click();
  await zoomIn(page);
  await expect(selected(page, 4, 'Structure')).toHaveAccessibleName('Module: Your program');
  await expect(highlights(page)).toHaveCount(0);
});

test('in a multi-line Program, a selected step highlights its own line in the editor, and nothing on the others', async ({ page }) => {
  await page.goto('/zoom/5');
  await run(page, GREET);
  const bytecode = zoomLevel(page, 5, 'Bytecode');

  await bytecode.getByRole('region', { name: 'greet’s steps' }).getByRole('button', { name: /LOAD_GLOBAL/ }).click();
  await expect(highlights(page)).toHaveText(['print']);
  await expect(highlightsOnLine(page, 2)).toHaveText(['print']);

  await bytecode.getByRole('region', { name: 'Your program’s steps' }).getByRole('button', { name: /Find greet/ }).click();
  await expect(highlights(page)).toHaveText(['greet']);
  await expect(highlightsOnLine(page, 5)).toHaveText(['greet']);
});

test('a step run stays selected through levels 6 to 9 and back', async ({ page }) => {
  await page.goto('/zoom/5');
  await run(page, GREET);
  const strip = zoomLevel(page, 5, 'Bytecode').getByRole('group', { name: 'Every step that ran, in order' }).getByRole('button');

  // The second call to print, in greet.
  await strip.nth(32).click();
  await gauge(page).getByRole('button', { name: '9 Pixels' }).click();
  await expect(highlightsOnLine(page, 2)).toHaveText(['print("Hello,", name)']);
  await gauge(page).getByRole('button', { name: '5 Bytecode' }).click();
  await expect(strip.nth(32)).toHaveAttribute('aria-current', 'step');
});

test('editing the code after Run takes the highlight away, since it no longer matches', async ({ page }) => {
  await page.goto('/zoom/3');
  await run(page, 'print("Hello World!")');
  await zoomLevel(page, 3, 'Tokens').getByRole('button', { name: 'NAME: print' }).click();
  await expect(highlights(page)).toHaveText(['print']);

  await editor(page).fill('x = 1');
  await expect(highlights(page)).toHaveCount(0);
});

test('a highlight out of sight in the editor scrolls the editor to it', async ({ page }) => {
  await page.goto('/zoom/3');
  const lines = Array.from({ length: 20 }, (_, at) => `n${at + 1} = ${at + 1}`);
  await run(page, lines.join('\n'));

  await zoomLevel(page, 3, 'Tokens').getByRole('button', { name: 'NAME: n18' }).click();
  await expect(highlightsOnLine(page, 18)).toHaveText(['n18']);
  // CodeMirror scrolls the box around the code, not the code itself.
  const scroller = page.locator('.editor-highlight .cm-scroller');
  await expect.poll(() => scroller.evaluate((box) => box.scrollTop)).toBeGreaterThan(0);
  const box = (await scroller.boundingBox())!;
  const mark = (await highlights(page).boundingBox())!;
  expect(mark.y).toBeGreaterThanOrEqual(box.y);
  expect(mark.y + mark.height).toBeLessThanOrEqual(box.y + box.height);
});
