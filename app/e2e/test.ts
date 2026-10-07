import { expect, test as base } from '@playwright/test';

export * from '@playwright/test';

/**
 * Playwright's test, which also fails if the page breaks its Content Security Policy (public/_headers), as when a
 * library adds a script or a style the policy refuses. The browser reports each refusal on the page's console.
 */
export const test = base.extend<{ cspRefusals: void }>({
  cspRefusals: [
    async ({ page }, use) => {
      const refused: string[] = [];
      page.on('console', (message) => message.text().includes('Content Security Policy') && refused.push(message.text()));
      await use();
      expect(refused, 'The page broke its Content Security Policy').toEqual([]);
    },
    { auto: true },
  ],
});
