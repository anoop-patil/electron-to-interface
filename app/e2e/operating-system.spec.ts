import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gauge, run, zoomLevel } from './helpers';

const GREET = 'def greet(name):\n    print("Hello,", name)\n\nfor person in ["Ada", "Grace"]:\n    greet(person)';

const os = (page: Page) => zoomLevel(page, 8, 'Operating system');
const lines = (page: Page) => os(page).getByRole('group', { name: 'Which line of output' });
const stages = (page: Page) => os(page).getByRole('list', { name: 'Stages' }).getByRole('button');
const zones = (page: Page) => os(page).getByRole('img');
const lit = (page: Page) => page.getByRole('region', { name: 'Your computer' }).locator('[aria-current="true"]');
const strip = (page: Page) => zoomLevel(page, 5, 'Bytecode').getByRole('group', { name: 'Every step that ran, in order' }).getByRole('button');

test('level 8 follows the line the selected step run printed, stage by stage, from the Program to the terminal', async ({ page }) => {
  await page.goto('/zoom/5');
  await run(page, GREET);
  // greet’s second call to print, which prints Hello, Grace.
  await strip(page).nth(32).click();
  await gauge(page).getByRole('button', { name: '8 OS' }).click();

  await expect(lines(page).getByRole('button')).toHaveText(['Hello, Ada', 'Hello, Grace']);
  await expect(lines(page).getByRole('button', { name: 'Hello, Grace' })).toHaveAttribute('aria-pressed', 'true');
  await expect(stages(page).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(os(page).getByRole('heading', { level: 2 })).toHaveText('Your program hands the pieces to Python’s output object');
  await expect(stages(page).first()).toContainText(`sys.stdout.write('Hello,') · write(' ') · write('Grace') · write('\\n')`);
  await expect(zones(page)).toHaveAccessibleName('Your program: Hello, Grace↵ · 13 bytes');
  await expect(lit(page)).toHaveCount(2);

  await stages(page).nth(2).click();
  await expect(os(page).getByRole('heading', { level: 2 })).toHaveText('Python knocks on door number 1');
  await expect(os(page)).toContainText('Python asks the operating system to write 13 bytes to door number 1.');
  await expect(os(page)).toContainText('Python makes 2 calls like this for your program, one for each line.');
  await expect(zones(page)).toHaveAccessibleName('System call: Hello, Grace↵ · 13 bytes');
  await expect(lit(page)).toHaveAccessibleName(/^Operating system .*door 1 → terminal · 13 bytes$/);

  // Another line keeps the stage.
  await lines(page).getByRole('button', { name: 'Hello, Ada' }).click();
  await expect(os(page)).toContainText('Python asks the operating system to write 11 bytes to door number 1.');
  await expect(stages(page).nth(2)).toHaveAttribute('aria-pressed', 'true');

  // Back at level 5, the step run that printed it is selected.
  await gauge(page).getByRole('button', { name: '5 Bytecode' }).click();
  await expect(strip(page).nth(16)).toHaveAttribute('aria-current', 'step');
});

test('the doors panel shows the three doors, with the line’s own lit, and the words open their Concept cards', async ({ page }) => {
  await page.goto('/zoom/8');
  await run(page, 'print("Hello World!")');

  const doors = os(page).getByRole('region', { name: 'Doors' });
  await expect(doors.getByRole('listitem')).toHaveText(['0input: your keyboard', '1output: your terminal. print uses this one', '2errors: also your terminal. A traceback uses this one']);
  await expect(doors.locator('[aria-current="true"]')).toHaveText(/^1output/);

  await doors.getByRole('button', { name: 'doors' }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Door numbers (file descriptors)');
  await expect(page.getByRole('dialog').getByRole('listitem')).toHaveCount(3);
  await page.keyboard.press('Escape');

  await os(page).getByRole('button', { name: 'system call' }).first().click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('System call');
});

test('a traceback’s lines go out through door 2, in color, after the line the Program printed', async ({ page }) => {
  await page.goto('/zoom/8');
  await run(page, 'print("Hi")\n1 / 0');

  await expect(lines(page).getByRole('button').first()).toHaveText('Hi');
  const error = lines(page).getByRole('button', { name: /^ZeroDivisionError: division by zero/ });
  await expect(error).toContainText('door 2');
  await error.click();
  await expect(os(page).getByRole('heading', { level: 2 })).toHaveText('Python hands its report of the error to sys.stderr');
  await expect(os(page).getByRole('region', { name: 'Doors' }).locator('[aria-current="true"]')).toHaveText(/^2errors/);

  await stages(page).nth(1).click();
  await expect(os(page)).toContainText('In a terminal, Python 3.14 colors a traceback, so 20 bytes of them are color codes');
});

test('a Program that printed nothing has no line to follow', async ({ page }) => {
  await page.goto('/zoom/8');
  await run(page, 'x = 1');

  await expect(os(page)).toContainText('Your program printed nothing, so Python never asked the operating system to write anything');
  await expect(lit(page)).toHaveAccessibleName(/^Operating system .*nothing to send: your program printed nothing$/);
});

test('Try it yourself lists the write calls with strace: a sample from the test machine, beside the pieces the browser saw', async ({ page }) => {
  await page.goto('/zoom/8');
  await run(page, GREET);

  await os(page).getByText('Try it yourself').click();
  await expect(os(page).locator('summary code')).toHaveText('strace -e trace=write python program.py');
  await os(page).getByRole('tab', { name: 'What you’ll see' }).click();
  const panel = os(page).getByRole('tabpanel');
  await expect(panel.locator('pre').first()).toHaveText(`sys.stdout ← 'Hello,'  ' '  'Ada'  '\\n'\nsys.stdout ← 'Hello,'  ' '  'Grace'  '\\n'`);
  await expect(panel.getByRole('button', { name: 'How we know: Observed' })).toBeVisible();
  await expect(panel).toContainText('Your browser can’t run strace');
  const sample = panel.getByRole('region', { name: 'A sample from our test machine' });
  await expect(sample).toContainText('strace -e trace=write python greet.py');
  await expect(sample.locator('pre')).toHaveText('write(1, "Hello, Ada\\n", 11)            = 11\nwrite(1, "Hello, Grace\\n", 13)          = 13\n+++ exited with 0 +++\n');
  await expect(sample.getByRole('button', { name: 'How we know: Reference' })).toBeVisible();

  await os(page).getByRole('tab', { name: 'How to read it' }).click();
  await expect(panel.getByRole('row')).toHaveCount(6);
  await expect(panel.getByRole('row').nth(3)).toContainText('11 and 13How many bytes each call writes.');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`level 8 passes an automated accessibility check in the ${scheme} theme`, async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/zoom/8');
    await run(page, 'print("Hi")\n1 / 0');
    await expect(lines(page).getByRole('button')).toHaveCount(6);
    // A door 2 line selected, at a stage in the first zone, whose highlight is the hardest to read on.
    await lines(page).getByRole('button').last().click();
    await page.waitForFunction(() => document.getAnimations().length === 0);

    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
