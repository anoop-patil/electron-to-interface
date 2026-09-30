import { expect, test, type Page } from '@playwright/test';

async function run(page: Page, program: string) {
  await page.goto('/');
  await page.getByLabel('Your program').fill(program);
  // Pyodide takes a few seconds to start; Run stays off until it has.
  await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Run' }).click();
}

const bytesZoomLevel = (page: Page) => page.getByRole('region', { name: 'Zoom level 2: Bytes' });

test('hello world is 22 bytes, from p to the newline, computed by Python 3.14.2 from our own site', async ({ page, baseURL }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await run(page, 'print("Hello World!")');

  const bytes = bytesZoomLevel(page).getByRole('button');
  await expect(bytes).toHaveCount(22);
  await expect(bytes.first()).toHaveAccessibleName('Byte 1: 112, 0x70, the character p');
  await expect(bytes.last()).toHaveAccessibleName('Byte 22: 10, 0x0A, a newline');
  await expect(page.getByText('Python 3.14.2')).toBeVisible();

  const origin = new URL(baseURL!).origin;
  expect(requested.filter((url) => url.startsWith('http') && new URL(url).origin !== origin)).toEqual([]);
});

test('every line of a program ends in a newline byte, even the last one', async ({ page }) => {
  await run(page, 'name = "Ada"\nfor i in range(2):\n    print(name, i)');

  await expect(page.getByRole('region', { name: 'Zoom level 1: Your code' })).toContainText('for i in range(2):');
  const lines = bytesZoomLevel(page).getByRole('list');
  await expect(lines).toHaveCount(3);
  for (const line of await lines.all()) {
    await expect(line.getByRole('button').last()).toHaveAccessibleName(/0x0A, a newline$/);
  }
});

test('selecting a byte highlights the character it encodes', async ({ page }) => {
  await run(page, 's = "é"');

  // é is stored as two bytes, 195 and 169; both belong to the same character.
  await bytesZoomLevel(page).getByRole('button', { name: /^Byte 7: 169/ }).click();

  await expect(page.getByRole('region', { name: 'Zoom level 1: Your code' }).locator('mark')).toHaveText('é');
});
