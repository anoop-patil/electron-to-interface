import { expect, type FrameLocator, type Page } from '@playwright/test';

/**
 * Types a Program, clicks Run once Python has started, and waits until the zoom view shows the Program, in place of the
 * hello world it shows at first. Works on a page or inside a frame.
 */
export async function run(page: Page | FrameLocator, program: string) {
  await page.getByRole('textbox', { name: 'Your program' }).fill(program);
  // Pyodide takes a few seconds to start; Run stays off until it has.
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  // A Run runs the Program and each Try it yourself command, which can take a while on a busy machine.
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
}

export const zoomLevel = (page: Page | FrameLocator, number: number, title: string) =>
  page.getByRole('region', { name: `Zoom level ${number}: ${title}` });

/** Whichever zoom level is on screen, if it is level `number`. */
export const anyZoomLevel = (page: Page | FrameLocator, number: number) =>
  page.getByRole('region', { name: new RegExp(`^Zoom level ${number}:`) });

export const gauge = (page: Page | FrameLocator) => page.getByRole('navigation', { name: 'Depth gauge' });
