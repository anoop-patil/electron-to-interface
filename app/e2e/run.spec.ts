import { expect, test, type Page } from '@playwright/test';
import { run, zoomLevel } from './helpers';

const bytesZoomLevel = (page: Page) => zoomLevel(page, 2, 'Bytes');

test('hello world is 22 bytes, from p to the newline, computed by Python 3.14.2 from our own site', async ({ page, baseURL }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await page.goto('/zoom/2');
  await run(page, 'print("Hello World!")');

  const bytes = bytesZoomLevel(page).getByRole('button', { name: /^Byte / });
  await expect(bytes).toHaveCount(22);
  await expect(bytes.first()).toHaveAccessibleName('Byte 1: 112, 0x70, the character p');
  await expect(bytes.last()).toHaveAccessibleName('Byte 22: 10, 0x0A, a newline');
  await expect(page.getByText('Python 3.14.2')).toBeVisible();

  const origin = new URL(baseURL!).origin;
  expect(requested.filter((url) => url.startsWith('http') && new URL(url).origin !== origin)).toEqual([]);
});

test('every line of a program ends in a newline byte, even the last one', async ({ page }) => {
  await page.goto('/');
  await run(page, 'name = "Ada"\nfor i in range(2):\n    print(name, i)');

  await expect(zoomLevel(page, 1, 'Your code')).toContainText('for i in range(2):');
  await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();
  const lines = bytesZoomLevel(page).getByRole('list');
  await expect(lines).toHaveCount(3);
  for (const line of await lines.all()) {
    await expect(line.getByRole('button').last()).toHaveAccessibleName(/0x0A, a newline$/);
  }
});

test('selecting a byte highlights the character it encodes, back at zoom level 1', async ({ page }) => {
  await page.goto('/zoom/2');
  await run(page, 's = "é"');

  // é is stored as two bytes, 195 and 169; both belong to the same character.
  await bytesZoomLevel(page).getByRole('button', { name: /^Byte 7: 169/ }).click();
  await page.getByRole('button', { name: 'Back: Your code' }).click();

  await expect(zoomLevel(page, 1, 'Your code').locator('mark')).toHaveText('é');
});
