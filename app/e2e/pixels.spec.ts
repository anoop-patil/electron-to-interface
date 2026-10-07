import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './test';
import { gauge, run, zoomLevel } from './helpers';

const GREET = 'def greet(name):\n    print("Hello,", name)\n\nfor person in ["Ada", "Grace"]:\n    greet(person)';

const pixels = (page: Page) => zoomLevel(page, 9, 'Pixels');
const lines = (page: Page) => pixels(page).getByRole('group', { name: 'Which line of output' });
const characters = (page: Page) => pixels(page).getByRole('group', { name: 'Characters' }).getByRole('button');
const grid = (page: Page) => pixels(page).getByRole('img', { name: /as a grid of/ });
const lit = (page: Page) => page.getByRole('region', { name: 'Your computer' }).locator('[aria-current="true"]');
const strip = (page: Page) => zoomLevel(page, 5, 'Bytecode').getByRole('group', { name: 'Every step that ran, in order' }).getByRole('button');

/** How many of the grid's pixels the page says are fully lit, partly lit and dark. */
async function counts(page: Page) {
  const text = await pixels(page).innerText();
  const count = (what: string) => Number(new RegExp(`(\\d+) pixels? ${what}`).exec(text)?.[1]);
  return { lit: count('fully lit'), partly: count('partly lit'), dark: count('dark') };
}

/** The distinct colors the big grid's canvas holds, as the browser painted it. */
const gridColors = (page: Page) =>
  grid(page).evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set<string>();
    for (let at = 0; at < data.length; at += 4) colors.add(`${data[at]},${data[at + 1]},${data[at + 2]}`);
    return colors.size;
  });

test('level 9 draws a character of the line the selected step run printed, enlarged into pixels, with anti-aliasing', async ({ page }) => {
  await page.goto('/zoom/5');
  await run(page, GREET);
  // greet’s second call to print, which prints Hello, Grace.
  await strip(page).nth(32).click();
  await gauge(page).getByRole('button', { name: '9 Pixels' }).click();

  await expect(lines(page).getByRole('button', { name: 'Hello, Grace' })).toHaveAttribute('aria-pressed', 'true');
  await expect(characters(page)).toHaveText(['H', 'e', 'l', 'l', 'o', ',', 'space', 'G', 'r', 'a', 'c', 'e']);
  await expect(characters(page).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(pixels(page).getByRole('heading', { level: 2 })).toHaveText('How H becomes pixels');
  await expect(pixels(page).getByRole('button', { name: 'How we know: Typical' }).first()).toBeVisible();
  await expect(pixels(page).getByRole('list', { name: 'From bytes to pixels' })).toContainText('72byte');

  // The browser drew it: some pixels fully lit, some partly, the rest dark, and the canvas holds many shades.
  await expect(pixels(page)).toContainText('fully lit');
  const drawn = await counts(page);
  expect(drawn.lit).toBeGreaterThan(0);
  expect(drawn.partly).toBeGreaterThan(0);
  expect(drawn.dark).toBeGreaterThan(0);
  expect(await gridColors(page)).toBeGreaterThan(4);
  await expect(pixels(page).getByRole('img', { name: 'Hello, Grace, at actual size' })).toBeVisible();

  // A space lights none.
  await characters(page).nth(6).click();
  await expect(pixels(page).getByRole('heading', { level: 2 })).toHaveText('A space lights no pixels');
  await expect(pixels(page)).toContainText('0 pixels fully lit');
  await expect(pixels(page)).toContainText('0 pixels partly lit');
  await expect(pixels(page)).not.toContainText('the font’s outline');
});

test('a line picked at level 9 stays picked at level 8, and back', async ({ page }) => {
  await page.goto('/zoom/9');
  await run(page, GREET);

  await expect(lines(page).getByRole('button', { name: 'Hello, Ada' })).toHaveAttribute('aria-pressed', 'true');
  await lines(page).getByRole('button', { name: 'Hello, Grace' }).click();
  await expect(characters(page).first()).toHaveAttribute('aria-pressed', 'true');
  await gauge(page).getByRole('button', { name: '8 OS' }).click();
  await expect(zoomLevel(page, 8, 'Operating system').getByRole('button', { name: 'Hello, Grace', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await zoomLevel(page, 8, 'Operating system').getByRole('button', { name: 'Hello, Ada', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in: Pixels' }).click();
  await expect(lines(page).getByRole('button', { name: 'Hello, Ada' })).toHaveAttribute('aria-pressed', 'true');
});

test('screen facts come from the learner’s own screen: the page, the Machine map and the Screen card', async ({ page }) => {
  await page.goto('/zoom/9');
  await run(page, 'print("Hi")');
  const size = await page.evaluate(() => `${Math.round(screen.width * devicePixelRatio)} × ${Math.round(screen.height * devicePixelRatio)}`);

  await expect(pixels(page)).toContainText(`From what your browser reports, your screen has ${size} pixels`);
  await expect(lit(page)).toHaveAccessibleName(new RegExp(`^Screen .*${size} pixels$`));
  await lit(page).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Screen');
  await expect(page.getByRole('dialog')).toContainText(`Your screen, from what your browser reports: ${size} pixels`);
  await page.getByRole('dialog').getByRole('button', { name: 'Pixel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Pixel');
});

test('a traceback’s line is drawn too, and an empty line has nothing to draw', async ({ page }) => {
  await page.goto('/zoom/9');
  await run(page, 'print()\n1 / 0');

  await lines(page).getByRole('button', { name: /^ZeroDivisionError: division by zero/ }).click();
  await expect(pixels(page).getByRole('heading', { level: 2 })).toHaveText('How Z becomes pixels');
  await expect(pixels(page)).toContainText('In a terminal, this line is in color');

  await lines(page).getByRole('button', { name: 'an empty line' }).click();
  await expect(pixels(page).getByRole('heading', { level: 2 })).toHaveText('This line is empty');
  await expect(characters(page)).toHaveCount(0);
});

test('a Program that printed nothing has nothing to draw', async ({ page }) => {
  await page.goto('/zoom/9');
  await run(page, 'x = 1');

  await expect(pixels(page)).toContainText('Your program printed nothing, so your terminal has no characters to draw.');
});

test('Try it yourself has no command: it says how to see the subpixels on a real screen', async ({ page }) => {
  await page.goto('/zoom/9');
  await run(page, 'print("Hi")');

  await expect(pixels(page).locator('summary')).toHaveText('Try it yourselfsee the subpixels');
  await pixels(page).locator('summary').click();
  await expect(pixels(page).locator('details')).toContainText('Put a small drop of water on your phone screen');
  await expect(pixels(page).getByRole('tab')).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`level 9 passes an automated accessibility check in the ${scheme} theme`, async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/zoom/9');
    await run(page, 'print("Hi there")');
    await expect(pixels(page)).toContainText('fully lit');

    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
