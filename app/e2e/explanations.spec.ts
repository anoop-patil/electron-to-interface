import { expect, test } from '@playwright/test';
import { run, zoomLevel } from './helpers';

test('zoom levels 1 and 2 explain the Program that was run, filled in from its Facts', async ({ page }) => {
  await page.goto('/');
  await run(page, 'name = "Ada"\nfor i in range(2):\n    print(name, i)');

  const code = zoomLevel(page, 1, 'Your code');
  await expect(code).toContainText('You typed 3 lines and clicked Run. At this level your program is still just text');
  await expect(code).toContainText('Your program has 3 lines and 51 characters');

  await page.getByRole('button', { name: 'Zoom in: Bytes' }).click();
  const bytes = zoomLevel(page, 2, 'Bytes');
  await expect(bytes).toContainText('Your program in bytes: 51 bytes, shown line by line');

  await bytes.getByRole('button', { name: /^Byte 1: / }).click();
  await expect(bytes.getByRole('heading', { level: 2 })).toHaveText('Byte 1 of 51: n is stored as 110');
  await expect(bytes).toContainText('Every character has an agreed number. n is 110.');
  await expect(bytes).toContainText('code point U+006E');

  await bytes.getByRole('button', { name: /^Byte 33: / }).click();
  await expect(bytes).toContainText('One of the 4 spaces that indent line 3.');
});
