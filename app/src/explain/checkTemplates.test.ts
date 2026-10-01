// @vitest-environment node
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { checkedTemplates } from './checkTemplates';

/** Builds with one Template file, as `vite build` does: the plugin checks every file in the templates folder. */
function build(json: string) {
  return async () => {
    const dir = await mkdtemp(join(tmpdir(), 'templates-'));
    await writeFile(join(dir, 'py314.json'), json);
    const plugin = checkedTemplates(dir);
    const context = { error: (message: string) => { throw new Error(message); } };
    await (plugin.buildStart as (this: typeof context) => Promise<void>).call(context);
  };
}

const fileWith = (template: object) => JSON.stringify({ pythonVersion: '3.14', templates: { 'byte.test': template } });

test('the shipped Templates pass the check', async () => {
  await expect(build(await readFile('templates/py314.json', 'utf-8'))()).resolves.toBeUndefined();
});

test('the build fails if a Template refers to a Fact that doesn’t exist', async () => {
  const run = build(fileWith({ subject: 'byte', text: 'This byte is {colour}.' }));

  await expect(run()).rejects.toThrow('byte.test refers to {colour}, which isn’t a Fact of a byte');
});

test('the build fails on a slot or bold mark that wouldn’t be filled in, instead of showing it as text', async () => {
  const run = build(fileWith({ subject: 'byte', text: 'Stored as **{ value }, at {code_point}.' }));

  await expect(run()).rejects.toThrow(
    ['byte.test refers to { value }, which isn’t a Fact of a byte', 'byte.test refers to {code_point}, which isn’t a Fact of a byte', 'byte.test has a ** with no closing **'].join('\n'),
  );
});

test('the build fails if a Template uses a Fact of a different subject', async () => {
  // The value of a byte means nothing for the whole Program.
  const run = build(fileWith({ subject: 'program', title: 'Stored as {value}', text: 'Your program.' }));

  await expect(run()).rejects.toThrow('byte.test refers to {value}, which isn’t a Fact of a program');
});

test('the build fails if a Template doesn’t match the schema', async () => {
  await expect(build(fileWith({ subject: 'byte' }))()).rejects.toThrow(/must have required property 'text'/);
});
