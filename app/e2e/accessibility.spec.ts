import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { anyZoomLevel, gauge, run, zoomLevel } from './helpers';

async function expectNoViolations(page: Page) {
  // Wait for the zoom animation to finish, so contrast is measured at full opacity.
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every zoom level passes an automated accessibility check in the ${scheme} theme`, async ({ page }) => {
    // It waits for Python to start, then runs 14 checks: alongside the other tests, that can take more than 30 seconds.
    test.slow();
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/zoom/1');
    await expectNoViolations(page);

    await run(page, 's = "é"\nprint(s)');
    await expect(zoomLevel(page, 1, 'Your code')).toContainText('print(s)');
    await expectNoViolations(page);

    // Try it yourself, open on the terminal output, with its Observed chip.
    await page.getByText('Try it yourself').click();
    await page.getByRole('tab', { name: 'What you’ll see' }).click();
    await expectNoViolations(page);

    // Level 2, with the bits panel, and Try it yourself's table of lines and bytes.
    await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();
    await zoomLevel(page, 2, 'Bytes').getByRole('button', { name: /^Byte 7:/ }).click();
    await page.getByRole('tab', { name: 'How to read it' }).click();
    await expectNoViolations(page);

    // A Concept card with a table, and the How we know card with every Honesty label chip.
    await zoomLevel(page, 2, 'Bytes').getByRole('button', { name: 'UTF-8' }).first().click();
    await expectNoViolations(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'How we know: Derived' }).click();
    await expectNoViolations(page);
    await page.keyboard.press('Escape');

    for (let level = 3; level <= 9; level++) {
      await gauge(page).getByRole('button').nth(level - 1).click();
      await expect(anyZoomLevel(page, level)).toBeVisible();
      await expectNoViolations(page);
    }
  });
}

test('everything works from the keyboard, with visible focus rings', async ({ page }) => {
  await page.goto('/zoom/1');

  // Tab until the gauge's tick for level 4 has focus.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (await gauge(page).getByRole('button', { name: '4 Structure' }).evaluate((el) => el === document.activeElement)) break;
  }
  const focused = page.locator(':focus');
  await expect(focused).toHaveAccessibleName('4 Structure');
  expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');

  await page.keyboard.press('Enter');
  await expect(zoomLevel(page, 4, 'Structure')).toBeVisible();

  // Zoom in from the keyboard, then keep going with the same button.
  await page.getByRole('button', { name: 'Zoom in: Bytecode' }).focus();
  await page.keyboard.press('Enter');
  await expect(zoomLevel(page, 5, 'Bytecode')).toBeVisible();
  await expect(page.locator(':focus')).toHaveAccessibleName('Zoom in: The interpreter');

  // At zoom level 9 the Zoom in button is gone, so focus moves to the level's heading rather than being lost.
  await gauge(page).getByRole('button', { name: '8 OS' }).click();
  await page.getByRole('button', { name: 'Zoom in: Pixels' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(':focus')).toHaveText('Pixels');
});
