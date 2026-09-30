import { expect, type FrameLocator, type Page } from '@playwright/test';

/** Types a Program and clicks Run, once Python has started. Works on a page or inside a frame. */
export async function run(page: Page | FrameLocator, program: string) {
  await page.getByLabel('Your program').fill(program);
  // Pyodide takes a few seconds to start; Run stays off until it has.
  await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Run' }).click();
}

export const zoomLevel = (page: Page | FrameLocator, number: number, title: string) =>
  page.getByRole('region', { name: `Zoom level ${number}: ${title}` });

/** Whichever zoom level is on screen, if it is level `number`. */
export const anyZoomLevel = (page: Page | FrameLocator, number: number) =>
  page.getByRole('region', { name: new RegExp(`^Zoom level ${number}:`) });

export const gauge = (page: Page | FrameLocator) => page.getByRole('navigation', { name: 'Depth gauge' });
