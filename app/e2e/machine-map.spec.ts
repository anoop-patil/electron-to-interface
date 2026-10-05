import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { gauge, run } from './helpers';

const map = (page: Page | FrameLocator) => page.getByRole('region', { name: 'Your computer' });
const lit = (page: Page | FrameLocator) => map(page).locator('[aria-current="true"]');

test('the map shows the learner’s computer, and lights where the Program is at zoom levels 1 to 4', async ({ page }) => {
  await page.goto('/zoom/1');
  for (const part of ['Disk', 'RAM', 'Python itself', 'Your steps', 'Objects', 'Plates', 'CPU', 'Registers', 'Cache', 'Operating system', 'Screen']) {
    await expect(map(page).getByRole('button', { name: new RegExp(`^${part}`) })).toBeVisible();
  }
  // Hello world, an Example, shows from the start. The app keeps the Program in RAM; it never saves it to the disk.
  await expect(lit(page)).toHaveCount(1);
  await expect(lit(page)).toHaveAccessibleName(/^RAM .*your program · 1 line$/);

  await run(page, 'print("Hello World!")');
  await expect(lit(page)).toHaveAccessibleName(/^RAM .*your program · 1 line$/);

  await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();
  await expect(lit(page)).toHaveAccessibleName(/^RAM .*your program · 22 characters$/);

  await page.getByRole('button', { name: 'Zoom in: Tokens' }).click();
  await expect(lit(page)).toHaveAccessibleName(/^RAM .*your program · read as 6 tokens$/);

  await page.getByRole('button', { name: 'Zoom in: Structure' }).click();
  await expect(lit(page)).toHaveAccessibleName(/^RAM .*your program · as 5 boxes, temporary$/);

  // Level 9 lights the screen.
  await gauge(page).getByRole('button', { name: '9 Pixels' }).click();
  await expect(lit(page)).toHaveCount(1);
  await expect(lit(page)).toHaveAccessibleName(/^Screen .*\d+ × \d+ pixels$/);
});

test('the map carries one Honesty label, Typical: it shows how computers usually work, and the learner’s may differ', async ({ page }) => {
  await page.goto('/zoom/1');
  await expect(map(page).getByRole('button', { name: /^How we know:/ })).toHaveCount(1);
  await map(page).getByRole('button', { name: 'How we know: Typical' }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('How we know');
});

test('every part opens its Concept card, in the kitchen metaphor', async ({ page }) => {
  await page.goto('/zoom/1');
  const parts = {
    Disk: 'A pantry',
    RAM: 'The kitchen counter',
    'Python itself': 'The cook',
    'Your steps': 'A recipe card',
    Objects: 'The shelves',
    Plates: 'A stack of plates',
    CPU: 'The stove',
    Registers: 'The burners on the stove',
    Cache: 'A tray right next to the stove',
    'Operating system': 'The restaurant manager',
    Screen: 'The dining room',
  };
  for (const [name, like] of Object.entries(parts)) {
    const part = map(page).getByRole('button', { name: new RegExp(`^${name}`) });
    await part.click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName(name);
    await expect(page.getByRole('dialog')).toContainText(like);
    await page.keyboard.press('Escape');
    await expect(part).toBeFocused();
  }
});

test('on a phone, the map collapses behind “Your computer: where is everything?”', async ({ page }) => {
  // Headless Chromium won't lay a page out narrower than about 490px, so the app goes in a 390px frame.
  await page.goto('/zoom/1');
  await page.setContent('<iframe src="/zoom/1" style="width:390px; height:844px; border:0"></iframe>');
  const frame = page.frameLocator('iframe');
  const toggle = frame.getByRole('button', { name: 'Your computer: where is everything?' });

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(map(frame).getByRole('button', { name: /^Disk/ })).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(map(frame).getByRole('button', { name: /^Disk/ })).toBeVisible();
});

test('on a desktop, the map is always visible, with no button to hide it', async ({ page }) => {
  await page.goto('/zoom/1');
  await expect(page.getByRole('button', { name: 'Your computer: where is everything?' })).toBeHidden();
  await expect(map(page).getByRole('button', { name: /^Disk/ })).toBeVisible();
});
