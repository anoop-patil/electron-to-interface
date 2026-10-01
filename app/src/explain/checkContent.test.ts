// @vitest-environment node
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { checkedContent } from './checkContent';

const SHIPPED = {
  templates: JSON.parse(await readFile('templates/py314.json', 'utf-8')),
  cards: JSON.parse(await readFile('concepts/cards.json', 'utf-8')),
  labels: JSON.parse(await readFile('concepts/honesty-labels.json', 'utf-8')),
};

/**
 * Builds with the shipped content, except for whatever `change` replaces, as `vite build` does:
 * the plugin checks every Template file, the Concept cards and the Honesty labels.
 */
function build(change: Partial<Record<keyof typeof SHIPPED, unknown>>) {
  return async () => {
    const root = await mkdtemp(join(tmpdir(), 'content-'));
    await cp('templates', join(root, 'templates'), { recursive: true });
    await cp('concepts', join(root, 'concepts'), { recursive: true });
    const files = { templates: 'templates/py314.json', cards: 'concepts/cards.json', labels: 'concepts/honesty-labels.json' };
    for (const [key, content] of Object.entries(change)) {
      await writeFile(join(root, files[key as keyof typeof files]), typeof content === 'string' ? content : JSON.stringify(content));
    }
    const plugin = checkedContent(root);
    const context = { error: (message: string) => { throw new Error(message); } };
    await (plugin.buildStart as (this: typeof context) => Promise<void>).call(context);
  };
}

const withTemplate = (template: object) => ({ templates: { pythonVersion: '3.14', templates: { 'byte.test': template } } });
const withCards = (cards: object) => ({ cards: { ...SHIPPED.cards, cards: { ...SHIPPED.cards.cards, ...cards } } });
const withLabels = (change: object) => ({ labels: { ...SHIPPED.labels, ...change } });

test('the shipped Templates, Concept cards and Honesty labels pass the check', async () => {
  await expect(build({})()).resolves.toBeUndefined();
});

test('the build fails if a Template refers to a Fact that doesn’t exist', async () => {
  const run = build(withTemplate({ subject: 'byte', text: 'This byte is {colour}.' }));

  await expect(run()).rejects.toThrow('byte.test refers to {colour}, which isn’t a Fact of a byte');
});

test('the build fails on a slot or bold mark that wouldn’t be filled in, instead of showing it as text', async () => {
  const run = build(withTemplate({ subject: 'byte', text: 'Stored as **{ value }, at {code_point}.' }));

  await expect(run()).rejects.toThrow(
    ['byte.test refers to { value }, which isn’t a Fact of a byte', 'byte.test refers to {code_point}, which isn’t a Fact of a byte', 'byte.test has a ** with no closing **'].join('\n'),
  );
});

test('the build fails if a Template uses a Fact of a different subject', async () => {
  // The value of a byte means nothing for the whole Program.
  const run = build(withTemplate({ subject: 'program', title: 'Stored as {value}', text: 'Your program.' }));

  await expect(run()).rejects.toThrow('byte.test refers to {value}, which isn’t a Fact of a program');
});

test('the build fails if a Template doesn’t match the schema', async () => {
  await expect(build(withTemplate({ subject: 'byte' }))()).rejects.toThrow(/must have required property 'text'/);
});

test('the build fails if highlighted words open a Concept card that doesn’t exist, or aren’t written as [[card|words]]', async () => {
  const run = build(withTemplate({ subject: 'byte', text: 'Half a [[nibble|byte]], in [[Binary|binary]] or [[byte]].' }));

  await expect(run()).rejects.toThrow(
    ['byte.test opens the Concept card nibble, which doesn’t exist', 'byte.test has [[Binary|binary]], which isn’t [[card|words]]', 'byte.test has [[byte]], which isn’t [[card|words]]'].join('\n'),
  );
});

test('the build fails if a Concept card links to a card that doesn’t exist, or has a slot no Fact fills', async () => {
  const run = build(withCards({ bit: { ...SHIPPED.cards.cards.bit, text: 'Part of a [[nibble|nibble]], like {value}.', related: ['byte', 'word'] } }));

  await expect(run()).rejects.toThrow(
    ['bit opens the Concept card nibble, which doesn’t exist', 'bit has {value}, but a Concept card has no Facts', 'bit is related to word, which doesn’t exist'].join('\n'),
  );
});

test('the build fails unless every Concept card is in the Concepts index exactly once', async () => {
  const card = { name: 'Nibble', like: 'Half a byte.', text: 'Four bits.', related: [] };
  const index = [...SHIPPED.cards.index, { name: 'Small things', cards: ['bit', 'word'] }];
  const run = build({ cards: { cards: { ...SHIPPED.cards.cards, nibble: card }, index } });

  await expect(run()).rejects.toThrow(
    ['the Concepts index lists bit more than once', 'the Concepts index lists word, which doesn’t exist', 'nibble isn’t in the Concepts index'].join('\n'),
  );
});

test('the build fails unless exactly one Concept card shows the Honesty labels, since every label chip opens it', async () => {
  const { honesty: _, ...cards } = SHIPPED.cards.cards;
  const index = SHIPPED.cards.index.filter((group: { name: string }) => group.name !== 'This page');

  await expect(build({ cards: { cards, index } })()).rejects.toThrow('No Concept card shows the Honesty labels');
});

test('the build fails if a zoom level or panel carries a label that isn’t in the set', async () => {
  const run = build(withLabels({ levels: { 1: 'observed', 2: 'traced' }, panels: { ...SHIPPED.labels.panels, byteBits: 'computed' } }));

  await expect(run()).rejects.toThrow(['zoom level 2 carries traced, which isn’t an Honesty label', 'panel byteBits carries computed, which isn’t an Honesty label'].join('\n'));
});

test('the build fails if more than one label has the warning color', async () => {
  const { labels } = SHIPPED.labels;
  const run = build(withLabels({ labels: { ...labels, typical: { ...labels.typical, warning: true } } }));

  await expect(run()).rejects.toThrow('More than one Honesty label has the warning color');
});

test('a different label set is an edit to the labels file alone: three labels instead of five pass the check', async () => {
  const { observed, reference, typical } = SHIPPED.labels.labels;
  const run = build(withLabels({ labels: { observed, reference, typical }, panels: { byteBits: 'observed', machineMap: 'typical', tryItOutput: 'observed' } }));

  await expect(run()).resolves.toBeUndefined();
});

test('the build fails if a Machine map note opens a Concept card: the note sits inside a part that opens its own', async () => {
  const run = build({ templates: { pythonVersion: '3.14', templates: { 'map.test': { subject: 'program', text: 'your program · {bytes} of [[utf8|UTF-8]]' } } } });

  await expect(run()).rejects.toThrow('map.test is a Machine map note, so it can’t open the Concept card utf8');
});

test('the build fails unless every part of the Machine map has its Concept card', async () => {
  const { disk: _, ...cards } = SHIPPED.cards.cards;
  const index = SHIPPED.cards.index.map((group: { name: string; cards: string[] }) => ({ ...group, cards: group.cards.filter((id) => id !== 'disk') }));

  await expect(build({ cards: { cards, index } })()).rejects.toThrow('The Machine map’s part disk has no Concept card');
});

test('the build fails if Try it yourself names a Fact that doesn’t exist, or opens a card that doesn’t exist', async () => {
  const tryIt = { command: 'python {file}', intro: 'Open a [[shell|shell]].', parts: [{ code: '{file}', text: 'The file, {colour}.' }], read: ['All **{bytes}.'] };
  const run = build({ templates: { ...SHIPPED.templates, tryIt: { 1: tryIt } } });

  await expect(run()).rejects.toThrow(
    [
      'tryIt 1 refers to {colour}, which isn’t a Fact of a program',
      'tryIt 1 has a ** with no closing **',
      'tryIt 1 opens the Concept card shell, which doesn’t exist',
    ].join('\n'),
  );
});

test('the build fails if a Try it yourself command uses a Fact other than {file}: the page runs it before the Program has other Facts', async () => {
  const tryIt = { ...SHIPPED.templates.tryIt[1], command: 'python {file} {lines}' };
  const run = build({ templates: { ...SHIPPED.templates, tryIt: { 1: tryIt } } });

  await expect(run()).rejects.toThrow('tryIt 1’s command uses {lines}, but a command can only use {file}');
});
