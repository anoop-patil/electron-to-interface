import { expect, test, type Page } from '@playwright/test';
import { run, zoomLevel } from './helpers';

const GREET = 'def greet(name):\n    print("Hello,", name)\n\nfor person in ["Ada", "Grace"]:\n    greet(person)';

const bytecode = (page: Page) => zoomLevel(page, 5, 'Bytecode');
const steps = (page: Page, code: string) => bytecode(page).getByRole('region', { name: `${code}’s steps` }).locator('[data-fact-id^="bc-"]');
const strip = (page: Page) => bytecode(page).getByRole('group', { name: 'Every step that ran, in order' }).getByRole('button');
const explanation = (page: Page) => bytecode(page).getByRole('heading', { level: 2 });
const term = (page: Page) => explanation(page).locator('xpath=following-sibling::p[1]');
const plates = (page: Page) => bytecode(page).getByRole('region', { name: 'Plates, after this step' });
const frame = (page: Page, name: string) => plates(page).getByRole('region', { name });

async function greet(page: Page) {
  await page.goto('/zoom/5');
  await run(page, GREET);
  await expect(strip(page)).toHaveCount(42);
}

test('each code object’s steps are listed under its name, plain names first, with how often each ran', async ({ page }) => {
  await greet(page);

  await expect(bytecode(page)).toContainText('So Python compiles them into lists of simple steps, called bytecode: one for your program, and one for greet.');
  await expect(steps(page, 'Your program')).toHaveCount(18);
  await expect(steps(page, 'greet')).toHaveCount(8);
  await expect(steps(page, 'Your program').nth(8)).toHaveText(/^9Find greetLOAD_NAME 0ran 2 times$/);
  await expect(steps(page, 'Your program').nth(6)).toHaveText(/^7Take the next item, or stopFOR_ITER 11ran 3 times$/);
  // END_FOR is one of the file's steps, but FOR_ITER jumps past it when the names run out.
  await expect(steps(page, 'Your program').nth(14)).toHaveText(/^15End of the loopEND_FORnever ran$/);
});

test('Next and Back follow the order the steps ran in, moving between code objects', async ({ page }) => {
  await greet(page);

  // The first step run is selected to start with.
  await expect(strip(page).first()).toHaveAttribute('aria-current', 'step');
  await expect(explanation(page)).toHaveText('Get ready');
  for (let at = 0; at < 11; at++) await bytecode(page).getByRole('button', { name: 'Next step' }).click();
  await expect(explanation(page)).toHaveText('Call greet with 1 thing');
  await bytecode(page).getByRole('button', { name: 'Next step' }).click();
  await expect(term(page)).toHaveText('RESUME 0 · step 1 of greet, run 1 of 2');
  await bytecode(page).getByRole('button', { name: 'Back a step' }).click();
  await expect(term(page)).toHaveText('CALL 1 · step 12 of your program, run 1 of 2');
  await expect(bytecode(page)).toContainText('it sets up a fresh frame for greet');
});

test('any run of any step can be picked, from the strip or from the step’s own runs', async ({ page }) => {
  await greet(page);

  await strip(page).nth(32).click();
  await expect(explanation(page)).toHaveText('Call print with 2 things');
  await expect(bytecode(page)).toContainText('print wrote a line to the terminal: Hello, Grace');

  await steps(page, 'Your program').nth(6).click();
  await expect(term(page)).toHaveText('FOR_ITER 11 (to L2) · step 7 of your program, run 1 of 3');
  await bytecode(page).getByRole('group', { name: 'Which run of this step' }).getByRole('button', { name: '3' }).click();
  await expect(bytecode(page)).toContainText('Trip 3 round the loop. The walker has no items left, so the loop ends: Python jumps out of it, to step 16.');

  await steps(page, 'Your program').nth(14).click();
  await expect(bytecode(page)).toContainText('Step 15 of your program never ran.');
  await expect(bytecode(page)).toContainText('This step never ran for your program.');
});

test('after a step run, the plates of every frame show, the caller waiting under the frame it called', async ({ page }) => {
  await greet(page);
  // The first run of greet’s LOAD_FAST_BORROW: Get name.
  await strip(page).nth(15).click();

  await expect(frame(page, 'greet’s frame')).toContainText('running now');
  await expect(frame(page, 'greet’s frame').getByRole('list', { name: 'Plates, the top one last' }).getByRole('listitem')).toHaveText([
    '<function print>',
    'empty',
    "'Hello,'",
    "'Ada'top",
  ]);
  await expect(frame(page, 'greet’s frame').getByRole('list', { name: 'Variables' })).toHaveText("name → 'Ada'");
  await expect(frame(page, 'Your program’s frame')).toContainText('waiting for greet');
  await expect(frame(page, 'Your program’s frame').getByRole('list', { name: 'Variables' }).getByRole('listitem')).toHaveText(['greet → <function greet>', "person → 'Ada'"]);
  // The walker is never stored, so Python's rules alone can't say which object it is.
  await expect(frame(page, 'Your program’s frame')).toContainText('the answer of step 6');
  // Python in the browser is 32-bit WebAssembly, so its objects are smaller than on a 64-bit computer: v8 measured 47 bytes there.
  await expect(bytecode(page).getByRole('region', { name: 'Objects, so far' })).toContainText("'Hello,'str · 27 bytes");
});

test('the recipe card shows the code object’s names, fixed values and variables, marking the one the step uses', async ({ page }) => {
  await greet(page);
  await strip(page).nth(14).click();

  const card = bytecode(page).getByRole('region', { name: 'greet’s recipe card' });
  await expect(card.getByRole('button', { name: 'How we know: Observed' })).toBeVisible();
  await expect(card.getByRole('list', { name: 'Names' })).toHaveText('0print');
  await expect(card.getByRole('list', { name: 'Fixed values' }).getByRole('listitem')).toHaveText(["0'Hello,'", '1None']);
  await expect(card.getByRole('list', { name: 'Its own variables' })).toHaveText('0name');
  await expect(card.getByRole('list', { name: 'Fixed values' }).getByRole('listitem').first()).toHaveClass(/border-accent/);

  // Getting greet's steps uses fixed value 0, not the name greet, which only the next steps store and find.
  await strip(page).nth(1).click();
  const programCard = bytecode(page).getByRole('region', { name: 'Your program’s recipe card' });
  await expect(programCard.getByRole('list', { name: 'Fixed values' }).getByRole('listitem').first()).toHaveClass(/border-accent/);
  await expect(programCard.getByRole('list', { name: 'Names' }).getByRole('listitem').first()).not.toHaveClass(/border-accent/);
});

test('the objects so far stay listed, those no longer in use marked so', async ({ page }) => {
  await greet(page);
  // After greet's first call has returned and its answer is thrown away, 'Hello,' and the first 'Ada' plate are gone.
  await strip(page).nth(20).click();

  const objects = bytecode(page).getByRole('region', { name: 'Objects, so far' });
  await expect(objects.getByRole('listitem').filter({ hasText: "'Hello,'" })).toContainText('not in use');
  await expect(objects.getByRole('listitem').filter({ hasText: '<function greet>' })).not.toContainText('not in use');
});

test('a step Python rewrote in the unwatched run says what it became, labeled Observed', async ({ page }) => {
  await greet(page);
  await strip(page).nth(14).click();

  const note = bytecode(page).getByText('Python rewrote this step into LOAD_CONST_MORTAL');
  await expect(note).toBeVisible();
  await expect(note.getByRole('button', { name: 'How we know: Observed' })).toBeVisible();
});

test('Play steps through every run by itself, and after the last, Next zooms in', async ({ page }) => {
  await greet(page);

  await bytecode(page).getByRole('button', { name: 'Play all 42' }).click();
  await expect(strip(page).nth(2)).toHaveAttribute('aria-current', 'step', { timeout: 5_000 });
  await bytecode(page).getByRole('button', { name: 'Stop', exact: true }).click();

  await strip(page).last().click();
  await expect(bytecode(page)).toContainText('Your program is finished.');
  await expect(plates(page)).toContainText('No frames: your program has finished.');
  await bytecode(page).getByRole('button', { name: 'All 42 done. Next: the interpreter' }).click();
  await expect(zoomLevel(page, 6, 'The interpreter')).toBeVisible();
});

test('the arrow keys move along the strip', async ({ page }) => {
  await greet(page);

  await strip(page).nth(3).click();
  await page.keyboard.press('ArrowRight');
  await expect(strip(page).nth(4)).toBeFocused();
  await expect(strip(page).nth(4)).toHaveAttribute('aria-current', 'step');
});

test('the Machine map lights your steps, the plates and the objects, with counts across frames', async ({ page }) => {
  await greet(page);
  await strip(page).nth(15).click();

  const map = page.getByRole('region', { name: 'Your computer' });
  await expect(map.getByRole('button', { name: /^Your steps .*greet, step 4 · run 16 of 42$/ })).toBeVisible();
  await expect(map.getByRole('button', { name: /^Plates .*5 plates, in 2 frames$/ })).toBeVisible();
  await expect(map.getByRole('button', { name: /^Objects .*4 objects in use$/ })).toBeVisible();
});

test('Try it yourself runs python -m dis on the learner’s file', async ({ page }) => {
  await greet(page);

  const tryIt = page.locator('details').filter({ hasText: 'Try it yourself' });
  await tryIt.locator('summary').click();
  await expect(tryIt).toContainText('python -m dis program.py');
  await tryIt.getByRole('tab', { name: 'What you’ll see' }).click();
  await expect(tryIt.locator('pre')).toContainText('LOAD_GLOBAL              1 (print + NULL)');
  await tryIt.getByRole('tab', { name: 'How to read it' }).click();
  await expect(tryIt.getByRole('tabpanel')).toContainText('Find print, and add an empty plate.');
});

test('a Program with a syntax error has no steps, and says so', async ({ page }) => {
  await page.goto('/zoom/5');
  await run(page, 'print("Hi"');

  await expect(bytecode(page)).toContainText('Python made no steps from your program: it stopped at a syntax error at zoom level 3, Tokens, before it got this far.');
});
