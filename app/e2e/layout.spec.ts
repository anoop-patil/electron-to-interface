import { expect, test, type Page } from '@playwright/test';
import { anyZoomLevel, gauge, run, zoomLevel } from './helpers';

test('desktop: the editor is on the left and the zoom view on the right', async ({ page }) => {
  await page.goto('/zoom/1');
  const editor = (await page.getByLabel('Your program').boundingBox())!;
  const view = (await zoomLevel(page, 1, 'Your code').boundingBox())!;
  expect(editor.x + editor.width).toBeLessThanOrEqual(view.x);
});

/**
 * Headless Chromium won't lay a page out narrower than about 490px, so the phone
 * checks load the app inside a frame that is exactly 390px wide.
 */
async function phone(page: Page, path: string) {
  await page.goto('/zoom/1');
  await page.setContent(`<iframe src="${path}" style="width:390px; height:844px; border:0"></iframe>`);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('body')).toBeVisible();
  return frame;
}

test.describe('phone, 390px wide', () => {
  test('the code is on top, collapsible to one line, and the gauge is a strip above the zoom view', async ({ page }) => {
    const frame = await phone(page, '/zoom/1');
    const editor = frame.getByLabel('Your program');
    const view = zoomLevel(frame, 1, 'Your code');
    expect((await editor.boundingBox())!.y).toBeLessThan((await view.boundingBox())!.y);

    const ticks = gauge(frame).getByRole('button');
    const tickYs = await Promise.all((await ticks.all()).map(async (tick) => (await tick.boundingBox())!.y));
    expect(Math.max(...tickYs) - Math.min(...tickYs)).toBeLessThan(2);
    const gaugeBox = (await gauge(frame).boundingBox())!;
    expect(gaugeBox.y + gaugeBox.height).toBeLessThanOrEqual((await view.boundingBox())!.y);

    await frame.getByRole('button', { name: 'Hide code' }).click();
    await expect(editor).toBeHidden();
    const pane = frame.getByRole('complementary', { name: 'Editor' });
    await expect(pane).toContainText('print("Hello World!")');
    expect((await pane.boundingBox())!.height).toBeLessThan(80);

    await frame.getByRole('button', { name: 'Show code' }).click();
    await expect(editor).toBeVisible();
  });

  test('no zoom level scrolls sideways', async ({ page }) => {
    const frame = await phone(page, '/zoom/1');
    await run(frame, 'greeting = "Hello, world! This line is long enough to need wrapping on a phone."\nprint(greeting)');
    await expect(zoomLevel(frame, 1, 'Your code')).toContainText('greeting');

    for (let level = 1; level <= 9; level++) {
      if (level > 1) await frame.getByRole('button', { name: /^Zoom in:/ }).click();
      await expect(anyZoomLevel(frame, level)).toBeVisible();
      const overflow = await page.frames()[1].evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `zoom level ${level}`).toBe(0);
    }
  });

  test('the bits panel and the Concept cards fit without scrolling sideways', async ({ page }) => {
    const frame = await phone(page, '/zoom/2');
    await run(frame, 'print("Hi")');
    await zoomLevel(frame, 2, 'Bytes').getByRole('button', { name: /^Byte 1: / }).click();
    const overflow = (selector: string) =>
      page.frames()[1].evaluate((s) => [...document.querySelectorAll(s)].map((el) => el.scrollWidth - el.clientWidth), selector);
    expect(await overflow('html')).toEqual([0]);

    for (const opener of ['How we know: Derived', 'UTF-8']) {
      await zoomLevel(frame, 2, 'Bytes').getByRole('button', { name: opener }).first().click();
      await expect(frame.getByRole('dialog')).toBeVisible();
      const gutters = await page.frames()[1].evaluate(() => {
        const card = document.querySelector('dialog')!.getBoundingClientRect();
        return [card.left, innerWidth - card.right];
      });
      expect(gutters, opener).toEqual([16, 16]);
      expect(await overflow('dialog > div'), opener).toEqual([0]);
      await frame.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    }
  });

  test('the gauge strip keeps the current zoom level in view', async ({ page }) => {
    const frame = await phone(page, '/zoom/1');
    for (const [path, name] of [['/zoom/9', '9 Pixels'], ['/zoom/1', '1 Code']]) {
      await page.frames()[1].evaluate((to) => {
        history.pushState(null, '', to);
        dispatchEvent(new PopStateEvent('popstate'));
      }, path);
      const current = gauge(frame).locator('[aria-current="step"]');
      await expect(current).toHaveAccessibleName(name);
      const strip = (await gauge(frame).boundingBox())!;
      const tick = (await current.boundingBox())!;
      expect(tick.x, path).toBeGreaterThanOrEqual(strip.x);
      expect(tick.x + tick.width, path).toBeLessThanOrEqual(strip.x + strip.width);
    }
  });
});
