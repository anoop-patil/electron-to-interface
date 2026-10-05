// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, expect, test } from 'vitest';
import { startPython, type Python } from '../engine/python';
import type { Analysis } from '../generated/analysis';
import { mapState } from '../machine/mapState';
import { allSteps } from './bytecode';
import type { Span } from './explain';
import { explainLevel7, instructionText, kindOf, level7, level7AfterRun, level7IsReference } from './machine';
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

test('instructions are sorted into kinds by their mnemonic, as prototypes v7 and v8 sort them', () => {
  expect(['mov', 'lea', 'add', 'dec', 'cmp', 'test', 'jne', 'call', 'jmp', 'setne', 'cltq'].map(kindOf)).toEqual([
    'move', 'move', 'math', 'math', 'compare', 'compare', 'jump', 'jump', 'jump', 'other', 'other',
  ]);
  expect(instructionText({ at: '1', bytes: '232 0', mnemonic: 'call', operands: '0x1825b00', note: 'fn:PyDict_GetItemRef' })).toBe('call  PyDict_GetItemRef');
  expect(instructionText({ at: '1', bytes: '15 132', mnemonic: 'je', operands: '0x1ab8000', note: 'rare' })).toBe('je  <rare-case code>');
  expect(instructionText({ at: '1', bytes: '72 131 236 8', mnemonic: 'sub', operands: 'rsp, 8' })).toBe('sub  rsp, 8');
});

test('every step run of hello world and greet.py has the machine code gdb recorded, or says which handler its work ran inside', async () => {
  const captures = await Promise.all(
    ['handler-paths-cpython-3.14.2-linux-x86_64.json', 'handler-paths-greet-cpython-3.14.2-linux-x86_64.json'].map(async (file) => JSON.parse(await readFile(`../prototype/data/${file}`, 'utf-8'))),
  );
  [hello, greet].forEach((analysis, at) => {
    const views = analysis.runs.map((run) => level7(analysis, run.id)!);
    expect(views.every((view) => view.handlers.length > 0 || view.inside !== null)).toBe(true);
    // Every handler run gdb recorded is shown, with every instruction it ran.
    const ran = views.flatMap((view) => view.handlers.map((handler) => [handler.handler, handler.ran.length]));
    expect(ran).toEqual(captures[at].runs.map((run: { op: string; steps: unknown[] }) => [run.op, run.steps.length]));
  });
});

test('hello world’s CALL shows prototype v7’s notes in the order they ran, with the reference counts gdb recorded', () => {
  const [call] = level7(hello, runOf(hello, 0, 8))!.handlers;

  expect(plain(call.title)).toBe('CALL');
  expect(call.summary.map(plain)).toEqual([
    '1,613 instructions in all: 824 in its main part (3,360 bytes), and 3,166 bytes in .warm and .cold parts that the build tools moved elsewhere in the program. On this run, 147 instructions ran: 147 in its main part.',
    'Functions it called: cfunction_vectorcall_FASTCALL_KEYWORDS.',
  ]);
  expect(call.keyLines.filter((line) => line.stage).map((line) => line.stage)).toEqual([
    'Get ready', 'Time to make this step faster?', 'What kind of thing is print?', 'Gather what to give print', 'Find print’s code and run it', 'Check the answer', 'Clear the plates', 'Put the answer on a plate and move on',
  ]);
  const [first] = call.keyLines;
  expect([plain(first.say), first.text, first.bytes, first.kind]).toEqual(['Make room on the CPU’s own stack: 208 bytes of scratch space for this step', 'sub  rsp, 0xd0', '72 129 236 208 0 0 0', 'math']);
  expect(call.keyLines.map((line) => plain(line.say))).toContain(
    'One fewer label points to print: 3 becomes 2. Python’s built-in names still point to it, so it stays',
  );
  expect(plain(call.path)).toBe(
    'Highlighted: the 147 instructions that ran, recorded one at a time with a debugger on our test machine. On this run the step wasn’t rewritten into a faster form. The only function it called is the one that starts print.',
  );
});

test('hello world’s RETURN_VALUE gives back a level of calls: the counter gdb read went from 999 to 1,000', () => {
  const [returned] = level7(hello, runOf(hello, 0, 20))!.handlers;

  expect(returned.keyLines.map((line) => plain(line.say))).toContain(
    'Python limits how deeply calls can go inside other calls, to catch runaway programs. Leaving yours gives one level back: 999 left becomes 1,000',
  );
});

test('a handler without notes of its own shows its calls and jumps as key lines, and its listings say what ran', () => {
  const [load] = level7(greet, runOf(greet, 0, 18))!.handlers;

  expect(load.keyLines.map((line) => plain(line.say))).toEqual([
    'The handler starts here',
    'Call PyDict_GetItemRef: look up a name in a dictionary',
    'Jump straight into the handler for the next step, looked up in a table of handlers',
  ]);
  expect(load.all.filter((row) => row.ran)).toHaveLength(new Set(load.ran.map((row) => row.text + row.bytes)).size);
  expect(load.all.some((row) => row.part === 'cold')).toBe(true);
});

test('a conditional jump that ran says whether it jumped, and one to another handler that didn’t is described as a check', () => {
  const [, exact] = level7(greet, runOf(greet, 0, 24, 2))!.handlers;

  expect(exact.handler).toBe('CALL_PY_EXACT_ARGS');
  expect(plain(exact.keyLines[1].say)).toBe('A check: does it need to fall back to CALL? No, so carry on (7 checks in a row like this one; the first is shown)');
  expect(exact.ran.find((row) => row.text === 'jne  _TAIL_CALL_CALL')).toMatchObject({ jumped: false });
  expect(exact.ran.filter((row) => row.jumped === true).length).toBeGreaterThan(0);
  expect(exact.ran.filter((row) => row.jumped === undefined).every((row) => !/^j(?!mp)/.test(row.text))).toBe(true);
});

test('greet.py’s second CALL runs CALL first, then CALL_PY_EXACT_ARGS, whose last instructions are RESUME_CHECK’s copied code', () => {
  const view = level7(greet, runOf(greet, 0, 24, 2))!;

  expect(view.handlers.map((handler) => plain(handler.title))).toEqual(['First: CALL', 'Then: CALL_PY_EXACT_ARGS']);
  expect(plain(view.handlers[1].path)).toContain('The last 11 instructions that ran are RESUME_CHECK’s code, the next step’s handler');
  expect(plain(view.handlers[1].summary[0])).toContain('On this run, 107 instructions ran: 5 in its main part, 83 in its .warm part and 19 in its .cold part.');
  expect(plain(explainLevel7(greet, view).text)).toContain('On this run, 33 instructions of CALL, then 107 of CALL_PY_EXACT_ARGS ran.');
});

test('greet’s second RESUME ran no handler of its own, and points to the step run whose handler ran its check', () => {
  const view = level7(greet, runOf(greet, 1, 0, 2))!;

  expect(view.handlers).toEqual([]);
  expect(view.inside).toEqual({ handler: 'CALL_PY_EXACT_ARGS', run: runOf(greet, 0, 24, 2) });
  expect(level7IsReference(view)).toBe(true);
  expect(plain(explainLevel7(greet, view).text)).toContain('On this run, its check ran inside the step before, as the last instructions of CALL_PY_EXACT_ARGS.');
});

test('a step of an Example that never ran, greet.py’s END_FOR, ran no machine code, and says so', () => {
  const endFor = allSteps(greet).find(({ step }) => step.opname === 'END_FOR')!;
  const view = level7(greet, endFor.step.id)!;

  expect(view.handlers).toEqual([]);
  expect(level7IsReference(view)).toBe(true);
  expect(plain(explainLevel7(greet, view).text)).toContain('This step never ran, so no machine code ran for it.');
});

test('for a Program that isn’t an Example, level 7 explains how it usually works, and the form Python rewrote the step into', () => {
  const own = python.analyze('print("Hi")');
  const view = level7(own, own.runs[3].id)!;

  expect(view.example).toBeNull();
  expect(level7IsReference(view)).toBe(false);
  expect(plain(explainLevel7(own, view).text)).toContain('your CPU runs the machine code of its handler for LOAD_CONST');
  expect(plain(level7AfterRun(own, view)!)).toBe(
    'When your program ran without being watched, Python had rewritten this step into LOAD_CONST_MORTAL, a faster form, by the time it finished. A run of the step after the rewrite runs LOAD_CONST_MORTAL’s machine code.',
  );
  expect(level7AfterRun(greet, level7(greet, runOf(greet, 0, 2))!)).toBeNull();
});

test('at level 7 the Machine map lights the CPU running the handlers’ machine code, its registers and cache, and Python itself in RAM', () => {
  const lit = (analysis: Analysis, selection: string | null) => mapState({ level: 7, analysis, selection }).lit.map(({ part, note }) => [part, plain(note)]);

  expect(lit(greet, runOf(greet, 0, 24, 2))).toEqual([
    ['cpu', 'running the machine code of CALL, then CALL_PY_EXACT_ARGS'],
    ['reg', 'bookmark, top plate, frame'],
    ['cache', 'busy machine code'],
    ['ram', ''],
    ['py', ''],
  ]);
  const own = python.analyze('print("Hi")');
  expect(lit(own, own.runs[1].id)[0]).toEqual(['cpu', 'running the machine code of LOAD_NAME']);
  const endFor = allSteps(greet).find(({ step }) => step.opname === 'END_FOR')!;
  expect(lit(greet, endFor.step.id)[0]).toEqual(['cpu', 'step 15 of your program never ran']);
});

test('Try it yourself shows each Example its own native timing sample, and any other Program greet.py’s', () => {
  expect(explainTryIt(7, hello)!.sample!.command).toBe(`python -c "import time; t = time.perf_counter(); exec(open('hello.py').read()); print(time.perf_counter() - t)"`);
  expect(explainTryIt(7, hello)!.sample!.output).toMatch(/^Hello World!\n/);
  expect(plain(explainTryIt(7, hello)!.sample!.caption)).toContain('on our test machine for hello world:');
  expect(explainTryIt(7, greet)!.sample!.command).toContain(`open('greet.py')`);
  expect(explainTryIt(7, python.analyze('print("Hi")'))!.sample!.command).toContain(`open('greet.py')`);
});
