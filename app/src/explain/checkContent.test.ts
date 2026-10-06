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
  reference: JSON.parse(await readFile('reference/cpython-3.14.2.json', 'utf-8')),
};

/**
 * Builds with the shipped content, except for whatever `change` replaces, as `vite build` does:
 * the plugin checks every Template file, the Concept cards, the Honesty labels and the Reference Library.
 */
function build(change: Partial<Record<keyof typeof SHIPPED, unknown>>) {
  return async () => {
    const root = await mkdtemp(join(tmpdir(), 'content-'));
    await cp('templates', join(root, 'templates'), { recursive: true });
    await cp('concepts', join(root, 'concepts'), { recursive: true });
    await cp('reference', join(root, 'reference'), { recursive: true });
    const files = { templates: 'templates/py314.json', cards: 'concepts/cards.json', labels: 'concepts/honesty-labels.json', reference: 'reference/cpython-3.14.2.json' };
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
const withEntry = (key: string, entry: object) => ({ reference: { ...SHIPPED.reference, entries: { ...SHIPPED.reference.entries, [key]: entry } } });

test('the shipped Templates, Concept cards, Honesty labels and Reference Library pass the check', async () => {
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

test('the build fails on a slot inside highlighted words, which would reach the page as text', async () => {
  const run = build(withTemplate({ subject: 'byte', text: 'It goes to [[byte|byte number {number}]].' }));

  await expect(run()).rejects.toThrow('byte.test has [[byte|byte number {number}]], whose slot wouldn’t be filled in');
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
  const panels = {
    byteBits: 'observed', machineMap: 'typical', terminal: 'observed', tryItOutput: 'observed', tryItSample: 'reference', stepRuns: 'observed',
    plates: 'observed', objects: 'observed', recipeCard: 'observed', afterRun: 'observed', noReference: 'typical', syntaxError: 'observed', registers: 'reference',
    outputPieces: 'observed', reportPieces: 'observed',
  };
  const run = build(withLabels({ labels: { observed, reference, typical }, panels }));

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

test('the build fails if a quoted line of C isn’t at the line numbers the Reference Library gives in bytecodes.c', async () => {
  const entry = {
    note: 'Shown: the whole instruction.',
    lines: [
      { say: 'Get the name', code: 'PyObject *name = GETITEM(FRAME_CO_NAMES, oparg);', first: 1740, last: 1740 },
      { say: 'Search for it', code: 'PyObject *v_o = _PyEval_LoadName(tstate, frame, names);', first: 1742, last: 1742 },
    ],
  };

  await expect(build(withEntry('LOAD_NAME', entry))()).rejects.toThrow(
    [
      'LOAD_NAME quotes line 1740 as PyObject *name = GETITEM(FRAME_CO_NAMES, oparg); but bytecodes.c has: inst(LOAD_NAME, (-- v)) {',
      'LOAD_NAME quotes line 1742 as PyObject *v_o = _PyEval_LoadName(tstate, frame, names); but bytecodes.c has: PyObject *v_o = _PyEval_LoadName(tstate, frame, name);',
    ].join('\n'),
  );
});

test('a quoted statement may span several lines of the source, and one ending in … matches their start', async () => {
  const entry = {
    note: 'Shown: two statements.',
    lines: [
      { say: 'Make a function', code: 'PyFunctionObject *func_obj = (PyFunctionObject *) PyFunction_New(codeobj, GLOBALS());', first: 4967, last: 4968 },
      { say: 'Is it a function written in Python?', code: 'if (Py_TYPE(callable_o) == &PyFunction_Type && …', first: 3775, last: 3775 },
    ],
  };

  await expect(build(withEntry('TEST', entry))()).resolves.toBeUndefined();
});

test('the build fails if the copy of bytecodes.c isn’t the file at the tag', async () => {
  const run = build({ reference: { ...SHIPPED.reference, source: { ...SHIPPED.reference.source, sha256: '0'.repeat(64) } } });

  await expect(run()).rejects.toThrow(`cpython-3.14.2/Python/bytecodes.c isn’t Python/bytecodes.c at v3.14.2: its SHA-256 is ${SHIPPED.reference.source.sha256}`);
});

test('the build fails if a Reference Library sentence names a Fact a step doesn’t have, or a card that doesn’t exist', async () => {
  const entry = { note: 'About [[nibble|nibbles]].', lines: [{ say: 'Take the plate off {colour}', code: 'PyStackRef_CLOSE(value);', first: 401, last: 401 }] };

  await expect(build(withEntry('POP_TOP', entry))()).rejects.toThrow(
    ['POP_TOP refers to {colour}, which isn’t a Fact of a step', 'POP_TOP opens the Concept card nibble, which doesn’t exist'].join('\n'),
  );
});

test('the build fails if an Example’s step run names a Reference Library entry that doesn’t exist', async () => {
  const [hello, ...others] = SHIPPED.reference.examples;
  const runs = [{ code: 0, offset: 0, handlers: [{ entry: 'RESUME/twice' }] }, ...hello.runs.slice(1)];
  const run = build({ reference: { ...SHIPPED.reference, examples: [{ ...hello, runs }, ...others] } });

  await expect(run()).rejects.toThrow('hello world’s step run 1 ran RESUME/twice, which has no entry');
});

test('the build fails if the Reference Library doesn’t match the schema', async () => {
  const run = build(withEntry('call', { note: 'Lower case.', lines: [] }));

  await expect(run()).rejects.toThrow(/must match pattern|must NOT have fewer than 1 items/);
});

/** The shipped Reference Library, with hello world's notes on one handler changed. */
function withLineNotes(handler: string, change: (notes: { lines: Record<string, string>; note?: string }) => object) {
  const lineNotes = SHIPPED.reference.lineNotes.map((notes: { handler: string; lines: Record<string, string> }) => (notes.handler === handler ? { ...notes, ...change(notes) } : notes));
  return { reference: { ...SHIPPED.reference, lineNotes } };
}

test('the build fails if a note on a machine instruction states a number nothing recorded', async () => {
  // gdb recorded print's reference count going from 3 to 2 at 186ea76; the instruction itself holds no number.
  const run = build(withLineNotes('CALL', ({ lines }) => ({ lines: { ...lines, '186ea76': 'One fewer label points to print: 3 becomes 2' } })));

  await expect(run()).rejects.toThrow(
    ['hello world’s notes on CALL states 3 at 186ea76, which gdb didn’t record and the instruction doesn’t hold', 'hello world’s notes on CALL states 2 at 186ea76, which gdb didn’t record and the instruction doesn’t hold'].join('\n'),
  );
});

test('a note can state a number its instruction holds, such as the 208 bytes of sub rsp, 0xd0, or a size such as a word, 2 bytes', async () => {
  const run = build(withLineNotes('CALL', ({ lines }) => ({ lines: { ...lines, '186e594': 'Make room: 208 bytes', '186eab1': 'Read one word, 2 bytes' } })));

  await expect(run()).resolves.toBeUndefined();
});

test('the build fails if a note names a number gdb didn’t record at its instruction, or sits on an instruction that didn’t run', async () => {
  // 186e594 changes no number, and 186e63a is an instruction of CALL that didn't run for hello world.
  const run = build(withLineNotes('CALL', ({ lines }) => ({ lines: { ...lines, '186e594': '{before} becomes {after}', '186e63a': 'Never ran' } })));

  await expect(run()).rejects.toThrow(
    [
      'hello world’s notes on CALL names {before} at 186e594, where gdb recorded no value',
      'hello world’s notes on CALL names {after} at 186e594, where gdb recorded no value',
      'hello world’s notes on CALL has a note on 186e63a, which didn’t run',
    ].join('\n'),
  );
});

test('the build fails if an Example’s path runs an instruction its handler doesn’t have', async () => {
  const [hello, ...others] = SHIPPED.reference.examples;
  const [resume] = hello.runs[0].handlers;
  const runs = [{ ...hello.runs[0], handlers: [{ ...resume, path: [...resume.path, 'abc'] }] }, ...hello.runs.slice(1)];
  const run = build({ reference: { ...SHIPPED.reference, examples: [{ ...hello, runs }, ...others] } });

  await expect(run()).rejects.toThrow('hello world’s step run 1 ran abc, which isn’t an instruction of RESUME');
});
