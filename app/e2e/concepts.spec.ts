import { expect, test, type Locator, type Page } from '@playwright/test';
import { anyZoomLevel, gauge, run, zoomLevel } from './helpers';

const card = (page: Page) => page.getByRole('dialog');

const LABELS = {
  Observed: 'Python itself recorded this from your code',
  Derived: 'Worked out from observed facts using Python’s rules',
  Reference: 'Real, but prepared in advance',
  Illustrative: 'A made-up example',
  Typical: 'How it usually works',
};

test.describe('Honesty labels', () => {
  test('zoom levels 1 to 7 each carry one for the level, level 5’s and 7’s panels carry their own, and levels not built yet carry none', async ({ page }) => {
    await page.goto('/zoom/1');
    await run(page, 'print("Hi")');

    const code = zoomLevel(page, 1, 'Your code');
    await expect(code.getByRole('button', { name: /^How we know:/ })).toHaveCount(1);
    await expect(code.getByRole('button', { name: 'How we know: Observed' })).toBeVisible();

    await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();
    // Until a byte is selected, nothing on level 2 differs from the level.
    await expect(zoomLevel(page, 2, 'Bytes').getByRole('button', { name: /^How we know:/ })).toHaveCount(1);
    await expect(zoomLevel(page, 2, 'Bytes').getByRole('button', { name: 'How we know: Observed' })).toBeVisible();

    await page.getByRole('button', { name: 'Zoom in: Tokens' }).click();
    await expect(zoomLevel(page, 3, 'Tokens').getByRole('button', { name: /^How we know:/ })).toHaveCount(1);
    await expect(zoomLevel(page, 3, 'Tokens').getByRole('button', { name: 'How we know: Observed' })).toBeVisible();

    await page.getByRole('button', { name: 'Zoom in: Structure' }).click();
    await expect(zoomLevel(page, 4, 'Structure').getByRole('button', { name: /^How we know:/ })).toHaveCount(1);
    await expect(zoomLevel(page, 4, 'Structure').getByRole('button', { name: 'How we know: Observed' })).toBeVisible();

    await page.getByRole('button', { name: 'Zoom in: Bytecode' }).click();
    const bytecode = zoomLevel(page, 5, 'Bytecode');
    // The level is Observed, as are the strip of step runs and the recipe card; the plates and objects are Derived.
    await expect(bytecode.getByRole('button', { name: /^How we know:/ }).first()).toHaveAccessibleName('How we know: Observed');
    await expect(bytecode.getByRole('region', { name: 'Plates, after this step' }).getByRole('button', { name: 'How we know: Derived' })).toBeVisible();
    await expect(bytecode.getByRole('region', { name: 'Objects, so far' }).getByRole('button', { name: 'How we know: Derived' })).toBeVisible();
    await expect(bytecode.getByRole('region', { name: 'Every step that ran, in order' }).getByRole('button', { name: 'How we know: Observed' })).toBeVisible();

    // print("Hi") isn't an Example, so level 6 has no C to show, and explains how it usually works. Its first step,
    // RESUME, says the form Python rewrote it into, which is Observed.
    await gauge(page).getByRole('button', { name: '6 Interpreter' }).click();
    const chips = zoomLevel(page, 6, 'The interpreter').getByRole('button', { name: /^How we know:/ });
    await expect(chips).toHaveCount(2);
    await expect(chips.first()).toHaveAccessibleName('How we know: Typical');
    await expect(chips.last()).toHaveAccessibleName('How we know: Observed');

    // Level 7 too explains how it usually works. Its registers are worked out by reading the machine code: Derived.
    await gauge(page).getByRole('button', { name: '7 CPU' }).click();
    const cpuChips = zoomLevel(page, 7, 'CPU instructions').getByRole('button', { name: /^How we know:/ });
    await expect(cpuChips).toHaveCount(3);
    await expect(cpuChips.nth(0)).toHaveAccessibleName('How we know: Typical');
    await expect(zoomLevel(page, 7, 'CPU instructions').getByRole('region', { name: 'Registers' }).getByRole('button', { name: 'How we know: Derived' })).toBeVisible();
    await expect(cpuChips.nth(2)).toHaveAccessibleName('How we know: Observed');

    // Level 8 is hand-written, so Typical; the pieces print handed over are Observed.
    await gauge(page).getByRole('button', { name: '8 OS' }).click();
    const osChips = zoomLevel(page, 8, 'Operating system').getByRole('button', { name: /^How we know:/ });
    await expect(osChips).toHaveCount(2);
    await expect(osChips.nth(0)).toHaveAccessibleName('How we know: Typical');
    await expect(osChips.nth(1)).toHaveAccessibleName('How we know: Observed');

    await gauge(page).getByRole('button', { name: '9 Pixels' }).click();
    await expect(anyZoomLevel(page, 9)).toBeVisible();
    await expect(anyZoomLevel(page, 9).getByRole('button', { name: /^How we know:/ })).toHaveCount(0);
  });

  test('every chip opens the How we know card, which defines every label', async ({ page }) => {
    await page.goto('/zoom/1');
    await run(page, 'print("Hi")');
    await zoomLevel(page, 1, 'Your code').getByRole('button', { name: 'How we know: Observed' }).click();

    await expect(card(page)).toHaveAccessibleName('How we know');
    for (const [name, means] of Object.entries(LABELS)) {
      await expect(card(page).getByText(name, { exact: true })).toBeVisible();
      await expect(card(page)).toContainText(means);
    }
  });

  test('are text chips: only Illustrative gets a warning color, and none is told apart by its border style', async ({ page }) => {
    await page.goto('/zoom/1');
    await run(page, 'print("Hi")');
    await zoomLevel(page, 1, 'Your code').getByRole('button', { name: 'How we know: Observed' }).click();

    const styles = Object.fromEntries(
      await Promise.all(
        Object.keys(LABELS).map(async (name) => {
          const chip = card(page).getByText(name, { exact: true });
          return [name, await chip.evaluate((el) => {
            const style = getComputedStyle(el);
            return { color: style.color, border: `${style.borderStyle} ${style.borderWidth}` };
          })] as const;
        }),
      ),
    );
    const { Illustrative, ...others } = styles;
    expect(new Set(Object.values(styles).map((style) => style.border)).size).toBe(1);
    expect(new Set(Object.values(others).map((style) => style.color)).size).toBe(1);
    expect(Illustrative.color).not.toBe(styles.Observed.color);
  });
});

test.describe('Concept cards', () => {
  test('highlighted words open a card inside the app: its name, a one-line analogy, the explanation and related cards', async ({ page }) => {
    await page.goto('/zoom/2');
    await run(page, 'print("Hi")');

    await zoomLevel(page, 2, 'Bytes').getByRole('button', { name: 'UTF-8' }).click();
    await expect(card(page)).toHaveAccessibleName('UTF-8');
    await expect(card(page)).toContainText('A shared dictionary that says which number stands for which character.');
    await expect(card(page)).toContainText('UTF-8 is the agreement almost every computer uses today.');
    await expect(card(page).getByRole('row', { name: 'é 195 169 2' })).toBeVisible();
    // Nothing links out for explanations.
    await expect(card(page).locator('a')).toHaveCount(0);

    const related = card(page).getByRole('group', { name: 'Related:' });
    await expect(related.getByRole('button')).toHaveText(['Byte', 'Encoding and decoding', 'Newline']);
    await related.getByRole('button', { name: 'Encoding and decoding' }).click();
    await expect(card(page)).toHaveAccessibleName('Encoding and decoding');
    // A highlighted word inside a card opens its card too.
    await card(page).getByRole('paragraph').getByRole('button', { name: 'UTF-8' }).click();
    await related.getByRole('button', { name: 'Byte' }).click();
    await expect(card(page)).toHaveAccessibleName('Byte');
    await expect(card(page)).toContainText('A row of 8 light switches.');
    await expect(card(page).getByRole('img', { name: '41 in binary is 00101001' })).toBeVisible();

    await card(page).getByRole('button', { name: 'Back' }).click();
    await expect(card(page)).toHaveAccessibleName('UTF-8');
    await card(page).getByRole('button', { name: 'Close' }).click();
    await expect(card(page)).toBeHidden();
  });

  test('level 1’s introduction ends with prototype v8’s sentence, after a highlighted word', async ({ page }) => {
    await page.goto('/zoom/1');
    await run(page, 'print("Hi")');

    const intro = zoomLevel(page, 1, 'Your code').getByText(/^You typed 1 line/);
    await expect(intro).toHaveText(/Highlighted words, like that one, open a short explanation\.$/);
    await intro.getByRole('button', { name: 'bytes' }).click();
    await expect(card(page)).toHaveAccessibleName('Byte');
  });

  test('the Concepts index, grouped as in prototype v8, opens from the header', async ({ page }) => {
    await page.goto('/zoom/1');
    await page.getByRole('banner').getByRole('button', { name: 'Concepts' }).click();

    await expect(card(page)).toHaveAccessibleName('Concepts');
    const group = (name: string) => card(page).getByRole('group', { name });
    await expect(group('This page').getByRole('button')).toHaveText(['How we know']);
    await expect(group('Storing text').getByRole('button')).toHaveText(['Bit', 'Byte', 'Binary', 'UTF-8', 'Encoding and decoding', 'Newline']);
    await expect(group('How Python reads your code').getByRole('button')).toHaveText(['Token', 'Structure (syntax tree)', 'Your steps']);

    await group('Storing text').getByRole('button', { name: 'Binary' }).click();
    await expect(card(page)).toHaveAccessibleName('Binary');
    await expect(card(page).getByRole('img', { name: '112 in binary is 01110000' })).toBeVisible();
    await card(page).getByRole('button', { name: 'Back' }).click();
    await expect(card(page)).toHaveAccessibleName('Concepts');
  });

  test('open and close from the keyboard: Escape closes, and focus goes back to the word that opened the card', async ({ page }) => {
    await page.goto('/zoom/2');
    await run(page, 'print("Hi")');

    const word = zoomLevel(page, 2, 'Bytes').getByRole('button', { name: 'UTF-8' });
    await word.focus();
    await page.keyboard.press('Enter');
    await expect(card(page)).toHaveAccessibleName('UTF-8');
    expect(await card(page).evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);

    // While a card is open, the arrow keys don't zoom.
    await page.keyboard.press('ArrowDown');
    await expect(page).toHaveURL(/\/zoom\/2$/);

    await page.keyboard.press('Escape');
    await expect(card(page)).toBeHidden();
    await expect(word).toBeFocused();

    await page.keyboard.press('Space');
    await expect(card(page)).toBeVisible();
    // Focus starts on the card's heading; just before it is the Close button.
    await page.keyboard.press('Shift+Tab');
    await expect(card(page).getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(card(page)).toBeHidden();
  });
});

test.describe('how the selected byte is stored', () => {
  const panel = (page: Page, value: number): Locator => page.getByRole('region', { name: `How the number ${value} is stored` });

  test('level 2 shows its 8 bits, each with its value, labeled Derived', async ({ page }) => {
    await page.goto('/zoom/2');
    await run(page, 'print("Hi")');
    await expect(page.getByRole('region', { name: /^How the number/ })).toHaveCount(0);

    await zoomLevel(page, 2, 'Bytes').getByRole('button', { name: /^Byte 1: / }).click();
    await expect(panel(page, 112)).toContainText('A byte is 8 bits: 8 tiny on/off switches.');
    await expect(panel(page, 112).getByRole('img', { name: '112 in binary is 01110000' })).toHaveText('012816413211608040201');
    await expect(panel(page, 112)).toContainText('64 + 32 + 16 = 112');
    await expect(panel(page, 112)).toContainText('So p is stored as the pattern 01110000.');

    await panel(page, 112).getByRole('button', { name: 'How we know: Derived' }).click();
    await expect(card(page)).toHaveAccessibleName('How we know');
  });
});
