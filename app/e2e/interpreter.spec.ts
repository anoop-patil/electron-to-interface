import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gauge, run, zoomLevel } from './helpers';

const GREET = 'def greet(name):\n    print("Hello,", name)\n\nfor person in ["Ada", "Grace"]:\n    greet(person)';

const interpreter = (page: Page) => zoomLevel(page, 6, 'The interpreter');
const handler = (page: Page, name: string) => interpreter(page).getByRole('region', { name: `The C code of ${name}`, exact: true });

/** greet.py at zoom level 6, with the second run of the file's CALL selected at level 5: the run that rewrote it. */
async function secondCall(page: Page) {
  await page.goto('/zoom/5');
  await run(page, GREET);
  const strip = zoomLevel(page, 5, 'Bytecode').getByRole('group', { name: 'Every step that ran, in order' }).getByRole('button');
  await expect(strip).toHaveCount(42);
  await strip.nth(27).click();
  await gauge(page).getByRole('button', { name: '6 Interpreter' }).click();
}

test('the Interpreter handoff says that, by default, CPython never compiles your code to CPU instructions', async ({ page }) => {
  await secondCall(page);

  await expect(interpreter(page)).toContainText('By default, CPython never compiles your code to CPU instructions.');
  await expect(interpreter(page)).toContainText('experimental JIT compiler');
  await expect(interpreter(page).getByLabel('The Interpreter handoff')).toContainText('Translated as far as bytecode, then followed step by step.');
});

test('a step run that rewrote its step shows the general form’s C, then the new form’s, labeled Reference, with links to GitHub', async ({ page }) => {
  await secondCall(page);

  await expect(interpreter(page).getByRole('button', { name: 'How we know: Reference' }).first()).toBeVisible();
  await expect(interpreter(page).getByRole('heading', { level: 2 })).toHaveText('How the interpreter does step 12 of your program');
  await expect(handler(page, 'CALL').getByRole('heading')).toHaveText('First, the general form: CALL');
  await expect(handler(page, 'CALL_PY_EXACT_ARGS').getByRole('heading')).toHaveText('Then the new form: CALL_PY_EXACT_ARGS');
  await expect(handler(page, 'CALL').getByRole('listitem').first()).toContainText('Has this step run often enough to be worth making faster? Yes, now');
  await expect(handler(page, 'CALL').getByRole('listitem').first()).toContainText('if (ADAPTIVE_COUNTER_TRIGGERS(counter)) {');
  await expect(handler(page, 'CALL').getByRole('link', { name: 'lines 3741–3744' })).toHaveAttribute(
    'href',
    'https://github.com/python/cpython/blob/v3.14.2/Python/bytecodes.c#L3741-L3744',
  );
});

test('picking another run of the step shows the C that ran on that run', async ({ page }) => {
  await secondCall(page);

  await interpreter(page).getByRole('group', { name: 'Which run of this step' }).getByRole('button', { name: '1' }).click();
  await expect(handler(page, 'CALL')).toContainText('Is this a function written in Python? Yes');
  await expect(handler(page, 'CALL_PY_EXACT_ARGS')).toHaveCount(0);
});

test('greet’s second RESUME says its check ran inside CALL_PY_EXACT_ARGS, and END_FOR says it never ran', async ({ page }) => {
  await secondCall(page);
  const steps = (code: string) => interpreter(page).getByRole('region', { name: `${code}’s steps` });

  await steps('greet').getByRole('button', { name: /Get ready/ }).click();
  await interpreter(page).getByRole('group', { name: 'Which run of this step' }).getByRole('button', { name: '2' }).click();
  await expect(interpreter(page)).toContainText('No handler of its own ran for this step.');
  await expect(handler(page, 'RESUME_CHECK')).toBeVisible();

  await steps('Your program').getByRole('button', { name: /End of the loop/ }).click();
  await expect(interpreter(page)).toContainText('This step never ran for your program. Here is the C code of its general form, END_FOR, anyway.');
  await expect(interpreter(page)).toContainText('3 · Run that C code. This step never got that far: it never ran.');
  await expect(handler(page, 'END_FOR')).toBeVisible();
});

test('the C ships with CPython’s license, which the site serves', async ({ page }) => {
  await secondCall(page);

  await expect(interpreter(page)).toContainText('Copyright (c) 2001 Python Software Foundation; All Rights Reserved.');
  const link = interpreter(page).getByRole('link', { name: 'Read the PSF License' });
  const response = await page.request.get((await link.getAttribute('href'))!);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2');
});

test('Try it yourself shows the forms the steps had become, observed live, and links to the C on GitHub', async ({ page }) => {
  await secondCall(page);

  await interpreter(page).getByText('Try it yourself').click();
  await expect(interpreter(page).getByRole('link', { name: 'CALL_PY_EXACT_ARGS: lines 4001–4022' })).toBeVisible();
  await interpreter(page).getByRole('tab', { name: 'What you’ll see' }).click();
  await expect(interpreter(page).locator('pre')).toContainText('CALL_PY_EXACT_ARGS');
  await expect(interpreter(page).locator('pre')).toContainText('FOR_ITER_TUPLE');
});

test('for a Program that isn’t an Example, level 6 explains how it usually works, labeled Typical, with no C', async ({ page }) => {
  await page.goto('/zoom/6');
  await run(page, 'x = 1\nprint(x)');

  await expect(interpreter(page).getByRole('button', { name: 'How we know: Typical' })).toBeVisible();
  await expect(interpreter(page)).toContainText('For your program, this is how it usually works.');
  await expect(interpreter(page).getByRole('region', { name: /^The C code of / })).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`level 6 with C to show passes an automated accessibility check in the ${scheme} theme`, async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: scheme });
    await secondCall(page);
    await page.waitForFunction(() => document.getAnimations().length === 0);

    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
