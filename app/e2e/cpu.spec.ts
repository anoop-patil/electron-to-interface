import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './test';
import { gauge, run, zoomLevel } from './helpers';

const GREET = 'def greet(name):\n    print("Hello,", name)\n\nfor person in ["Ada", "Grace"]:\n    greet(person)';

const cpu = (page: Page) => zoomLevel(page, 7, 'CPU instructions');
const handler = (page: Page, name: string) => cpu(page).getByRole('region', { name: `The machine code of ${name}`, exact: true });

/** A Program at zoom level 7, with its `nth` step run, counted from 0, selected at level 5. */
async function stepRun(page: Page, program: string, nth: number, runs: number) {
  await page.goto('/zoom/5');
  await run(page, program);
  const strip = zoomLevel(page, 5, 'Bytecode').getByRole('group', { name: 'Every step that ran, in order' }).getByRole('button');
  await expect(strip).toHaveCount(runs);
  await strip.nth(nth).click();
  await gauge(page).getByRole('button', { name: '7 CPU' }).click();
}

/** greet.py's second run of the file's CALL: the run that rewrote it into CALL_PY_EXACT_ARGS. */
const secondCall = (page: Page) => stepRun(page, GREET, 27, 42);

test('a step run that rewrote its step shows the machine code of both handlers, with the path each took, labeled Reference', async ({ page }) => {
  await secondCall(page);

  await expect(cpu(page).getByRole('button', { name: 'How we know: Reference' }).first()).toBeVisible();
  await expect(cpu(page).getByRole('heading', { level: 2 })).toHaveText('The real machine code for step 12 of your program');
  await expect(cpu(page)).toContainText('On this run, 33 instructions of CALL, then 107 of CALL_PY_EXACT_ARGS ran.');
  await expect(handler(page, 'CALL').getByRole('heading', { level: 3 })).toHaveText('First: CALL');
  await expect(handler(page, 'CALL_PY_EXACT_ARGS').getByRole('heading', { level: 3 })).toHaveText('Then: CALL_PY_EXACT_ARGS');
  const exact = handler(page, 'CALL_PY_EXACT_ARGS');
  await expect(exact).toContainText('On this run, 107 instructions ran: 5 in its main part, 83 in its .warm part and 19 in its .cold part.');
  await expect(exact).toContainText('The last 11 instructions that ran are RESUME_CHECK’s code');
  // A conditional jump to another handler that didn't jump is a check.
  await expect(exact.getByRole('listitem').nth(1)).toContainText('A check: does it need to fall back to CALL? No, so carry on (7 checks in a row like this one; the first is shown)');
  await expect(exact.getByRole('listitem').nth(1)).toContainText('jne  _TAIL_CALL_CALL');
});

test('the full listings show the instructions that ran, in order, and every instruction of the handler with those highlighted', async ({ page }) => {
  await secondCall(page);
  const exact = handler(page, 'CALL_PY_EXACT_ARGS');

  await exact.getByText('Show the 107 instructions that ran, in order').click();
  const ran = exact.getByRole('table', { name: 'The instructions CALL_PY_EXACT_ARGS ran, in order' });
  await expect(ran.locator('tbody tr')).toHaveCount(107);
  await expect(ran.locator('tbody tr').nth(3)).toContainText('jne  _TAIL_CALL_CALL · didn’t jump');

  await exact.getByText('Show all 151 instructions of this handler').click();
  const all = exact.getByRole('table', { name: 'All the instructions of CALL_PY_EXACT_ARGS' });
  await expect(all.locator('tbody tr')).toHaveCount(151);
  await expect(all.locator('tbody tr.bg-accent-soft')).toHaveCount(107);
});

test('greet’s second RESUME says its check ran inside CALL_PY_EXACT_ARGS, and points to it', async ({ page }) => {
  await stepRun(page, GREET, 28, 42);

  await expect(cpu(page)).toContainText('No handler of its own ran for this step.');
  await expect(cpu(page).getByRole('region', { name: /^The machine code of / })).toHaveCount(0);
  await cpu(page).getByRole('button', { name: 'See them in CALL_PY_EXACT_ARGS' }).click();
  await expect(handler(page, 'CALL_PY_EXACT_ARGS')).toBeVisible();
  await expect(cpu(page).getByRole('heading', { level: 2 })).toHaveText('The real machine code for step 12 of your program');
});

test('hello world’s CALL is explained line by line, with the reference counts the debugger recorded', async ({ page }) => {
  await stepRun(page, 'print("Hello World!")', 4, 8);
  const call = handler(page, 'CALL');

  await expect(call.getByRole('heading', { level: 5 }).first()).toHaveText('Get ready');
  await expect(call).toContainText('Make room on the CPU’s own stack: 208 bytes of scratch space for this step');
  await expect(call).toContainText('One fewer label points to print: 3 becomes 2. Python’s built-in names still point to it, so it stays');
  await expect(call).toContainText('its bytes 72 129 236 208 0 0 0');
});

test('the registers are worked out by reading the machine code, so they are labeled Derived', async ({ page }) => {
  await secondCall(page);

  const registers = cpu(page).getByRole('region', { name: 'Registers' });
  await expect(registers.getByRole('button', { name: 'How we know: Derived' })).toBeVisible();
  await expect(registers).toContainText('r15');
  await expect(registers).toContainText('A bookmark: where we are in the bytecode being run');
});

test('the machine code ships with CPython’s license, which the site serves', async ({ page }) => {
  await secondCall(page);

  await expect(cpu(page)).toContainText('Copyright (c) 2001 Python Software Foundation; All Rights Reserved.');
  const link = cpu(page).getByRole('link', { name: 'Read the PSF License' });
  const response = await page.request.get((await link.getAttribute('href'))!);
  expect(response.ok()).toBe(true);
});

test('Try it yourself times the Program in the browser, observed, and shows a native sample from the test machine', async ({ page }) => {
  await secondCall(page);

  await cpu(page).getByText('Try it yourself').click();
  await expect(cpu(page).locator('summary code')).toHaveText(
    `python -c "import time; t = time.perf_counter(); exec(open('program.py').read()); print(time.perf_counter() - t)"`,
  );
  await cpu(page).getByRole('tab', { name: 'What you’ll see' }).click();
  const panel = cpu(page).getByRole('tabpanel');
  await expect(panel.locator('pre').first()).toHaveText(/^Hello, Ada\nHello, Grace\n\d+(\.\d+)?(e-\d+)?\n?$/);
  await expect(panel.getByRole('button', { name: 'How we know: Observed' })).toBeVisible();
  const sample = panel.getByRole('region', { name: 'A sample from our test machine' });
  await expect(sample).toContainText(`exec(open('greet.py').read())`);
  await expect(sample.getByRole('button', { name: 'How we know: Reference' })).toBeVisible();
  await expect(sample).toContainText('A sample of the same command, run with CPython 3.14.2 on our test machine for greet.py: Linux');

  await cpu(page).getByRole('tab', { name: 'How to read it' }).click();
  await expect(panel).toContainText('In your browser, Python runs as WebAssembly rather than directly on your CPU');
});

test('for a Program that isn’t an Example, level 7 explains how it usually works, labeled Typical, with no machine code', async ({ page }) => {
  await page.goto('/zoom/7');
  await run(page, 'x = 1\nprint(x)');

  await expect(cpu(page).getByRole('button', { name: 'How we know: Typical' })).toBeVisible();
  await expect(cpu(page)).toContainText('For your program, this is how it usually works.');
  await expect(cpu(page).getByRole('region', { name: /^The machine code of / })).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`level 7 with machine code to show passes an automated accessibility check in the ${scheme} theme`, async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: scheme });
    await secondCall(page);
    await handler(page, 'CALL_PY_EXACT_ARGS').getByText('Show all 151 instructions of this handler').click();
    await page.waitForFunction(() => document.getAnimations().length === 0);

    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
