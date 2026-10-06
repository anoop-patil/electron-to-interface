import { expect, test } from '@playwright/test';

const SITE = 'https://electrontointerface.com';

test('the page carries a description and the Open Graph tags a link preview is built from', async ({ page }) => {
  await page.goto('/zoom/1');
  const meta = (attribute: string, value: string) => page.locator(`head meta[${attribute}="${value}"]`);

  await expect(meta('name', 'description')).toHaveAttribute('content', /^Write a short Python program/);
  await expect(meta('property', 'og:title')).toHaveAttribute('content', /^ElectronToInterface/);
  await expect(meta('property', 'og:description')).toHaveAttribute('content', /^Write a short Python program/);
  await expect(meta('property', 'og:url')).toHaveAttribute('content', `${SITE}/`);
  await expect(meta('property', 'og:image')).toHaveAttribute('content', `${SITE}/og-image.png`);
  await expect(meta('property', 'og:image:width')).toHaveAttribute('content', '1200');
  await expect(meta('property', 'og:image:height')).toHaveAttribute('content', '630');
  await expect(meta('name', 'twitter:card')).toHaveAttribute('content', 'summary_large_image');
});

test('the preview image is a 1200 × 630 PNG the site serves itself', async ({ request }) => {
  const response = await request.get('/og-image.png');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
  // A PNG's width and height are the 4-byte numbers at bytes 16 and 20, in its IHDR chunk.
  const png = await response.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});
