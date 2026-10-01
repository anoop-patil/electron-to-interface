import { expect, test, type Page } from '@playwright/test';
import { gauge, run, zoomLevel } from './helpers';

const currentTick = (page: Page) => gauge(page).locator('[aria-current="step"]');

test.describe('the depth gauge', () => {
  test('has 9 ticks, lights the current zoom level and marks the Interpreter handoff between 5 and 6', async ({ page }) => {
    await page.goto('/zoom/3');

    const ticks = gauge(page).getByRole('button');
    await expect(ticks).toHaveCount(9);
    await expect(currentTick(page)).toHaveCount(1);
    await expect(currentTick(page)).toHaveAccessibleName('3 Tokens');

    const handoff = gauge(page).getByText('Interpreter handoff');
    await expect(handoff).toBeVisible();
    const handoffBox = (await handoff.boundingBox())!;
    expect((await ticks.nth(4).boundingBox())!.y).toBeLessThan(handoffBox.y);
    expect((await ticks.nth(5).boundingBox())!.y).toBeGreaterThan(handoffBox.y);
  });

  test('doubles as navigation', async ({ page }) => {
    await page.goto('/zoom/1');
    await gauge(page).getByRole('button', { name: '7 CPU' }).click();

    await expect(page).toHaveURL(/\/zoom\/7$/);
    await expect(zoomLevel(page, 7, 'CPU instructions')).toBeVisible();
    await expect(currentTick(page)).toHaveAccessibleName('7 CPU');
  });
});

test.describe('moving between zoom levels', () => {
  test('Zoom in and Back move one zoom level and change the URL', async ({ page }) => {
    await page.goto('/zoom/1');

    await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();
    await expect(page).toHaveURL(/\/zoom\/2$/);
    await expect(zoomLevel(page, 2, 'Bytes')).toBeVisible();

    await page.getByRole('button', { name: 'Back: Your code' }).click();
    await expect(page).toHaveURL(/\/zoom\/1$/);
    await expect(zoomLevel(page, 1, 'Your code')).toBeVisible();
  });

  test('the down and up arrows zoom in and out, but not while typing', async ({ page }) => {
    await page.goto('/zoom/4');
    await page.locator('body').click();

    await page.keyboard.press('ArrowDown');
    await expect(zoomLevel(page, 5, 'Bytecode')).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(zoomLevel(page, 3, 'Tokens')).toBeVisible();
    await expect(page).toHaveURL(/\/zoom\/3$/);

    await page.getByLabel('Your program').press('ArrowDown');
    await expect(zoomLevel(page, 3, 'Tokens')).toBeVisible();
  });

  test('after a click, the arrow keys move focus to the new zoom level and leave no focus ring behind', async ({ page }) => {
    const ringed = () => page.evaluate(() => [...document.querySelectorAll(':focus-visible')].filter((el) => getComputedStyle(el).outlineStyle !== 'none').length);
    await page.goto('/zoom/1');
    await run(page, 'print("Hi")');

    // A clicked gauge tick, Zoom in button or byte would otherwise keep focus, and get a ring once a key is pressed.
    await gauge(page).getByRole('button', { name: '2 Bytes' }).click();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(':focus')).toHaveText('Tokens');
    expect(await ringed()).toBe(0);

    await page.getByRole('button', { name: 'Back: Bytes' }).click();
    await zoomLevel(page, 2, 'Bytes').getByRole('button', { name: /^Byte 1: / }).click();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator(':focus')).toHaveText('Your code');
    expect(await ringed()).toBe(0);

    await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator(':focus')).toHaveText('Your code');
    expect(await ringed()).toBe(0);
  });

  test('there is no zooming past zoom level 1 or 9', async ({ page }) => {
    await page.goto('/zoom/9');
    await expect(page.getByRole('button', { name: /^Zoom in/ })).toHaveCount(0);
    await page.locator('body').click();
    await page.keyboard.press('ArrowDown');
    await expect(page).toHaveURL(/\/zoom\/9$/);

    await page.goto('/zoom/1');
    await expect(page.getByRole('button', { name: /^Back/ })).toHaveCount(0);
  });

  test('the browser’s back and forward buttons move between zoom levels', async ({ page }) => {
    await page.goto('/zoom/1');
    await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();
    await page.getByRole('button', { name: 'Zoom in: Tokens' }).click();
    await expect(zoomLevel(page, 3, 'Tokens')).toBeVisible();

    await page.goBack();
    await expect(zoomLevel(page, 2, 'Bytes')).toBeVisible();
    await page.goBack();
    await expect(zoomLevel(page, 1, 'Your code')).toBeVisible();
    await page.goForward();
    await expect(zoomLevel(page, 2, 'Bytes')).toBeVisible();
  });

  test('a deep link opens its zoom level, and zoom levels not built yet say so', async ({ page }) => {
    for (const [number, title] of [[6, 'The interpreter'], [9, 'Pixels']] as const) {
      await page.goto(`/zoom/${number}`);
      await expect(zoomLevel(page, number, title)).toContainText('isn’t built yet');
    }
  });

  test('any other address opens zoom level 1 at /zoom/1', async ({ page }) => {
    for (const path of ['/', '/zoom/12']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/zoom\/1$/);
      await expect(zoomLevel(page, 1, 'Your code')).toBeVisible();
    }
  });

  test('the address keeps its query and fragment, where Share links will carry the program', async ({ page }) => {
    await page.goto('/?from=test#program');
    await expect(page).toHaveURL(/\/zoom\/1\?from=test#program$/);
    await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();
    await expect(page).toHaveURL(/\/zoom\/2\?from=test#program$/);
  });

  test('zooming again before a zoom has finished adds one history entry, not two', async ({ page }) => {
    await page.goto('/zoom/1');
    await page.locator('body').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(zoomLevel(page, 3, 'Tokens')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/zoom\/1$/);
    await expect(zoomLevel(page, 1, 'Your code')).toBeVisible();
  });

  test('clicking an element selects it and never zooms in, however often it is clicked', async ({ page }) => {
    await page.goto('/zoom/2');
    await run(page, 'x = 1');

    const byte = zoomLevel(page, 2, 'Bytes').getByRole('button', { name: /^Byte 1:/ });
    await byte.click();
    await byte.click();
    await byte.dblclick();

    await expect(byte).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/\/zoom\/2$/);
  });

  test('Run keeps the learner at the zoom level they are on', async ({ page }) => {
    await page.goto('/zoom/2');
    await run(page, 'x = 1');
    await expect(zoomLevel(page, 2, 'Bytes').getByRole('button', { name: /^Byte / })).toHaveCount(6);
    await expect(page).toHaveURL(/\/zoom\/2$/);
  });
});

test.describe('motion', () => {
  /** Zooms in and reports the animations running on the page just after the click. */
  async function animationsWhileZooming(page: Page) {
    await page.goto('/zoom/1');
    await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();
    return page.evaluate(() =>
      document.getAnimations().map((animation) => {
        const effect = animation.effect as KeyframeEffect;
        const META = ['offset', 'computedOffset', 'easing', 'composite'];
        return { duration: Number(effect.getTiming().duration), properties: effect.getKeyframes().flatMap(Object.keys).filter((key) => !META.includes(key)) };
      }),
    );
  }

  test('the zoom scales and fades in about 250 ms', async ({ page }) => {
    const animations = await animationsWhileZooming(page);
    expect(animations).toHaveLength(1);
    expect(animations[0].properties).toContain('transform');
    expect(animations[0].properties).toContain('opacity');
    await expect(zoomLevel(page, 2, 'Bytes')).toBeVisible();
    // Leaving plus arriving: check the whole zoom by timing it.
    const total = await page.evaluate(async () => {
      const start = performance.now();
      document.querySelector<HTMLButtonElement>('[data-zoom="in"]')!.click();
      while (document.getAnimations().length > 0 || !document.querySelector('[aria-label="Zoom level 3: Tokens"]')) {
        await new Promise(requestAnimationFrame);
      }
      return performance.now() - start;
    });
    expect(total).toBeGreaterThan(200);
    expect(total).toBeLessThan(600);
  });

  test('with reduced motion on, the zoom is a plain crossfade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const animations = await animationsWhileZooming(page);
    expect(animations).toHaveLength(1);
    expect(new Set(animations[0].properties)).toEqual(new Set(['opacity']));
  });

  test('nothing else animates', async ({ page }) => {
    await page.goto('/zoom/2');
    await run(page, 'x = 1');
    const byte = zoomLevel(page, 2, 'Bytes').getByRole('button', { name: /^Byte 1:/ });
    await byte.hover();
    await byte.click();
    await page.getByRole('button', { name: /^Switch to/ }).click();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

test.describe('themes', () => {
  const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  test('follow the system setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/zoom/1');
    const light = await background(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await background(page)).not.toBe(light);
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
  });

  test('have a manual toggle that is remembered', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/zoom/1');
    const light = await background(page);

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    const dark = await background(page);
    expect(dark).not.toBe(light);

    await page.reload();
    expect(await background(page)).toBe(dark);
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    expect(await background(page)).toBe(light);
  });

  test('tint the zoom view from warm to cool as the learner goes deeper', async ({ page }) => {
    const tint = async (level: number) => {
      await page.goto(`/zoom/${level}`);
      return page.evaluate(() => {
        const [r, , b] = getComputedStyle(document.querySelector('.stage')!).backgroundColor.match(/\d+/g)!.map(Number);
        return b - r;
      });
    };
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      expect(await tint(1)).toBeLessThan(0);
      expect(await tint(9)).toBeGreaterThan(0);
    }
  });
});

test('IBM Plex Sans and Mono come from our own site as WOFF2, two weights each', async ({ page, baseURL }) => {
  const fonts: string[] = [];
  page.on('request', (request) => request.resourceType() === 'font' && fonts.push(request.url()));
  await page.goto('/zoom/1');
  await page.evaluate(() => document.fonts.ready);

  const faces = await page.evaluate(() =>
    [...document.fonts].map((face) => `${face.family.replace(/"/g, '')} ${face.weight}`).sort(),
  );
  expect(faces).toEqual(['IBM Plex Mono 400', 'IBM Plex Mono 600', 'IBM Plex Sans 400', 'IBM Plex Sans 600']);
  expect(await page.evaluate(() => document.fonts.check('16px "IBM Plex Sans"') && document.fonts.check('16px "IBM Plex Mono"'))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"IBM Plex Sans"/);

  expect(fonts.length).toBeGreaterThan(0);
  for (const url of fonts) {
    expect(new URL(url).origin).toBe(new URL(baseURL!).origin);
    expect(url).toMatch(/\.woff2$/);
  }
});
