// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, expect, test } from 'vitest';
import { startPython, type Python } from '../engine/python';
import type { Analysis } from '../generated/analysis';
import { allSteps } from './bytecode';
import type { Span } from './explain';
import { mapState } from '../machine/mapState';
import { explainLevel6, level6, level6AfterRun } from './interpreter';
import { explainTryIt } from './tryIt';

let python: Python;
let greet: Analysis;
let hello: Analysis;

const plain = (spans: Span[] | undefined) => (spans ?? []).map((span) => span.text).join('');

beforeAll(async () => {
  python = await startPython();
  const captured = JSON.parse(await readFile('../prototype/data/example-greet-cpython-3.14.2.json', 'utf-8'));
  greet = python.analyze(captured.source, captured.file);
  hello = python.analyze('print("Hello World!")');
}, 60_000);

/** The step run of a step, counted from 1, by its code object and offset. */
function runOf(analysis: Analysis, code: number, offset: number, nth = 1) {
  return analysis.runs.filter((run) => run.code === code && run.offset === offset)[nth - 1].id;
}

/** What level 6 shows for a Selection: each handler, by its Reference Library entry, with its sentences. */
function shown(analysis: Analysis, selection: string) {
  return level6(analysis, selection)!.handlers.map((handler) => ({ handler: handler.handler, entry: handler.entry, inside: handler.inside, say: handler.lines.map((line) => plain(line.say)) }));
}

test('every step run of hello world and greet.py, as Python in the browser runs them, has the handlers gdb recorded natively', () => {
  for (const analysis of [hello, greet]) {
    const view = analysis.runs.map((run) => level6(analysis, run.id)!);
    expect(view.every((one) => one.handlers.length > 0)).toBe(true);
    expect(view[0].example).toBe(analysis === hello ? 'hello world' : 'greet.py');
  }
});

test('hello world’s LOAD_NAME shows the C that looks up print, each line with its sentence and line number', () => {
  const view = level6(hello, runOf(hello, 0, 2))!;

  expect(view.handlers).toHaveLength(1);
  const [handler] = view.handlers;
  expect(handler.handler).toBe('LOAD_NAME');
  expect(handler.lines.map((line) => [plain(line.say), line.first])).toEqual([
    ['Get the name print from the code’s list of names', 1741],
    ['Search for it: your variables, then global names, then built-ins', 1742],
    ['Not found anywhere? Stop with a NameError', 1743],
    ['Found it: put a label for it on a plate', 1744],
  ]);
  expect(handler.links).toEqual([{ where: 'lines 1741–1744', href: 'https://github.com/python/cpython/blob/v3.14.2/Python/bytecodes.c#L1741-L1744' }]);
});

test('greet.py’s CALL runs greet the general way first, then rewrites itself and runs the new form', () => {
  expect(shown(greet, runOf(greet, 0, 24, 1)).map(({ entry }) => entry)).toEqual(['CALL/python']);

  const second = shown(greet, runOf(greet, 0, 24, 2));
  expect(second.map(({ handler, entry }) => [handler, entry])).toEqual([['CALL', 'CALL/rewrites'], ['CALL_PY_EXACT_ARGS', 'CALL_PY_EXACT_ARGS']]);
  expect(second[0].say[0]).toBe('Has this step run often enough to be worth making faster? Yes, now');
});

test('print, called from greet, is a C function; its second call rewrites the step into CALL_BUILTIN_FAST_WITH_KEYWORDS', () => {
  const first = shown(greet, runOf(greet, 1, 16, 1));
  expect(first.map(({ entry }) => entry)).toEqual(['CALL/c']);
  expect(first[0].say).toContain('Collect what to give it: 2 things');

  expect(shown(greet, runOf(greet, 1, 16, 2)).map(({ handler }) => handler)).toEqual(['CALL', 'CALL_BUILTIN_FAST_WITH_KEYWORDS']);
});

test('greet’s second RESUME ran no handler of its own: RESUME_CHECK’s code ran inside CALL_PY_EXACT_ARGS', () => {
  expect(shown(greet, runOf(greet, 1, 0, 1)).map(({ entry }) => entry)).toEqual(['RESUME']);
  expect(shown(greet, runOf(greet, 1, 0, 2)).map(({ entry, inside }) => [entry, inside])).toEqual([['RESUME_CHECK', 'CALL_PY_EXACT_ARGS']]);
});

test('the loop ends when FOR_ITER_TUPLE finds no names left', () => {
  expect(shown(greet, runOf(greet, 0, 12, 3)).map(({ entry }) => entry)).toEqual(['FOR_ITER_TUPLE/ends']);
});

test('a step that never ran, greet.py’s END_FOR, shows its general form’s C, with no run selected', () => {
  const endFor = allSteps(greet).find(({ step }) => step.opname === 'END_FOR')!;
  const view = level6(greet, endFor.step.id)!;

  expect(view.selected.run).toBeNull();
  expect(view.handlers.map((handler) => handler.entry)).toEqual(['END_FOR']);
});

test('a Program that isn’t one of the Examples has no handlers recorded, so level 6 has no Reference C to show', () => {
  const own = python.analyze('print("Hi")');
  const view = level6(own, own.runs[1].id)!;

  expect(view.example).toBeNull();
  expect(view.handlers).toEqual([]);
});

test('level 6 keeps the step run selected at any other level, and selects the first step run when nothing is selected', () => {
  expect(level6(greet, null)!.selected.run).toBe(0);
  // The token print, at level 3, reaches level 6 as the first run of its step, LOAD_GLOBAL in greet.
  const print = greet.tokens.find((token) => token.text === 'print')!;
  expect(level6(greet, print.id)!.selected.step.step.opname).toBe('LOAD_GLOBAL');
});

test('at level 6 the Machine map lights Python itself, with the C for the handlers that ran, beside your steps, in RAM, on the CPU', () => {
  const lit = (analysis: Analysis, selection: string | null) =>
    mapState({ level: 6, analysis, selection }).lit.map(({ part, note }) => [part, plain(note)]);

  expect(lit(greet, runOf(greet, 0, 24, 2))).toEqual([
    ['ram', ''],
    ['py', 'the C code for CALL, then CALL_PY_EXACT_ARGS'],
    ['code', ''],
    ['cpu', ''],
  ]);
  const own = python.analyze('print("Hi")');
  expect(lit(own, own.runs[1].id)[1]).toEqual(['py', 'the C code for LOAD_NAME']);
  const endFor = allSteps(greet).find(({ step }) => step.opname === 'END_FOR')!;
  expect(lit(greet, endFor.step.id)[1]).toEqual(['py', 'step 15 of your program never ran']);
});

test('level 6’s Explanation says how the interpreter does the step, and that a rewriting run ran twice over', () => {
  const second = explainLevel6(greet, level6(greet, runOf(greet, 0, 24, 2))!);

  expect(plain(second.title)).toBe('How the interpreter does step 12 of your program');
  expect(plain(second.more)).toBe('On this run the step ran twice over: first in its general form, CALL, which rewrote the step into the faster CALL_PY_EXACT_ARGS, and then in that new form.');
  expect(explainLevel6(greet, level6(greet, runOf(greet, 0, 24, 1))!).more).toBeUndefined();
});

test('for a Program that isn’t an Example, level 6 explains how it usually works, and the form Python rewrote the step into', () => {
  const own = python.analyze('print("Hi")');
  const explanation = explainLevel6(own, level6(own, own.runs[3].id)!);

  expect(plain(explanation.text)).toContain('the piece of its own C code for LOAD_CONST');
  expect(explanation.more).toBeUndefined();
  expect(plain(level6AfterRun(own, level6(own, own.runs[3].id)!)!)).toBe('When your program ran without being watched, Python had rewritten this step into LOAD_CONST_MORTAL, a faster form, by the time it finished. A run of the step after the rewrite starts with LOAD_CONST_MORTAL’s C code.');
});

test('lines of C far apart in the source get a link each, so no link takes in code the page doesn’t quote', () => {
  // JUMP_BACKWARD_NO_JIT's check for urgent work is near the top of bytecodes.c, its jump far below.
  const [, jump] = level6(greet, runOf(greet, 0, 34, 1))!.handlers;

  expect(jump.handler).toBe('JUMP_BACKWARD_NO_JIT');
  expect(jump.links.map(({ where }) => where)).toEqual(['lines 158–159', 'line 3047']);
  expect(jump.links[1].href).toBe('https://github.com/python/cpython/blob/v3.14.2/Python/bytecodes.c#L3047');
});

test('Try it yourself links to the lines of C level 6 shows for the selected step run', () => {
  const links = explainTryIt(6, greet, runOf(greet, 0, 24, 2))!.links;

  expect(links.map(({ text }) => text)).toEqual(['CALL: lines 3741–3744', 'CALL_PY_EXACT_ARGS: lines 4001–4022', 'CALL_PY_EXACT_ARGS: line 4037']);
});
