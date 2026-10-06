import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { anyZoomLevel, run, zoomLevel } from './helpers';

/** The test program set, which src/zoom/unusualPrograms.test.ts also zooms through for every element. */
const FOLDER = new URL('../test-programs/', import.meta.url);
const PROGRAMS = readdirSync(FOLDER)
  .filter((file) => file.endsWith('.py'))
  .map((file) => ({ file, source: readFileSync(new URL(file, FOLDER), 'utf8') }));

for (const { file, source } of PROGRAMS) {
  test(`${file} zooms through every level in the browser without an error`, async ({ page }) => {
    // One line of 2,500 terms takes about 19 seconds on its own, and can pass 30 alongside the other tests.
    if (file === 'deep.py') test.slow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/zoom/1');
    await run(page, source);
    // A Run that fails says so, and leaves the Program shown before, hello world, on screen.
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(anyZoomLevel(page, 1)).toContainText(source.split('\n')[0].slice(0, 60));

    for (let level = 1; level < 9; level++) {
      await expect(anyZoomLevel(page, level)).toBeVisible();
      await page.locator('[data-zoom="in"]').click();
    }
    await expect(anyZoomLevel(page, 9)).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('a box with no Template of its own links to its part of Python’s documentation', async ({ page }) => {
  await page.goto('/zoom/4');
  await run(page, readFileSync(new URL('match.py', FOLDER), 'utf8'));
  const structure = zoomLevel(page, 4, 'Structure');

  await structure.getByRole('button', { name: /^Match:/ }).first().click();

  const link = structure.getByRole('link', { name: 'Read about Match in Python’s documentation' });
  await expect(link).toHaveAttribute('href', 'https://docs.python.org/3.14/library/ast.html#ast.Match');
  await expect(link).toHaveAttribute('target', '_blank');
});
