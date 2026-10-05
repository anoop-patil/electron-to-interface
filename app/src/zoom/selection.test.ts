// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, expect, test } from 'vitest';
import { startPython, type Python } from '../engine/python';
import { runsOfStep, stepById, stepOfRun } from '../explain/bytecode';
import { codeOf } from '../explain/syntaxTree';
import type { Analysis } from '../generated/analysis';
import { charsOf, selectionAt } from './selection';

let python: Python;
let hello: Analysis;
let greet: Analysis;

beforeAll(async () => {
  python = await startPython();
  hello = python.analyze('print("Hello World!")');
  const captured = JSON.parse(await readFile('../prototype/data/example-greet-cpython-3.14.2.json', 'utf-8'));
  greet = python.analyze(captured.source, captured.file);
}, 60_000);

/** The Fact with this ID, as the page names it: its kind and what it holds. */
function describe(analysis: Analysis, id: string | null) {
  if (id === null) return null;
  const token = analysis.tokens.find((found) => found.id === id);
  if (token) return `${token.type} ${token.text} on line ${token.start.line}`;
  if (id.startsWith('byte-')) {
    const byte = analysis.bytes[Number(id.slice('byte-'.length))];
    return `byte ${String.fromCharCode(byte.value)} on line ${byte.line}`;
  }
  const node = analysis.ast.find((found) => found.id === id);
  if (node) return node.span ? `${node.type} ${codeOf(analysis, node)} on line ${analysis.bytes[node.span.start].line}` : node.type;
  const run = analysis.runs.find((found) => found.id === id);
  if (run) {
    const { step, code } = stepOfRun(analysis, run);
    return `${step.opname} in code ${code}, run ${runsOfStep(analysis, step).indexOf(analysis.runs.indexOf(run)) + 1}`;
  }
  const step = stepById(analysis, id);
  if (step) return `${step.step.opname} in code ${step.code}, never ran`;
  return id;
}

test('a byte of print selects the print token at level 3', () => {
  expect(describe(hello, selectionAt(hello, 'byte-2', 3))).toBe('NAME print on line 1');
});

test('the print token selects the print box at level 4', () => {
  const print = hello.tokens.find((token) => token.text === 'print')!.id;

  expect(describe(hello, selectionAt(hello, print, 4))).toBe('Name print on line 1');
});

test('the print box selects the first run of the step that finds print, at level 5', () => {
  const print = hello.ast.find((node) => node.type === 'Name')!.id;

  expect(describe(hello, selectionAt(hello, print, 5))).toBe('LOAD_NAME in code 0, run 1');
});

test('a step run selects its box, its token and its first byte, and stays selected at level 5', () => {
  // The second run of greet’s LOAD_GLOBAL, which finds print on line 2.
  const run = greet.runs.filter((found) => found.code === 1 && stepOfRun(greet, found).step.opname === 'LOAD_GLOBAL')[1].id;

  expect(describe(greet, selectionAt(greet, run, 4))).toBe('Name print on line 2');
  expect(describe(greet, selectionAt(greet, run, 3))).toBe('NAME print on line 2');
  expect(describe(greet, selectionAt(greet, run, 2))).toBe('byte p on line 2');
  expect(describe(greet, selectionAt(greet, run, 5))).toBe('LOAD_GLOBAL in code 1, run 2');
});

test('a step from a whole call selects the Call box, not the statement around it with the same code', () => {
  const call = hello.runs.find((run) => stepOfRun(hello, run).step.opname === 'CALL')!.id;

  expect(describe(hello, selectionAt(hello, call, 4))).toBe('Call print("Hello World!") on line 1');
});

test('with no Selection, levels 2 to 4 select nothing until the learner picks, and level 5 selects the first step run', () => {
  for (const level of [2, 3, 4]) expect(selectionAt(greet, null, level)).toBeNull();
  expect(describe(greet, selectionAt(greet, null, 5))).toBe('RESUME in code 0, run 1');
});

test('a Selection with no place in the code, such as greet’s arguments or a block’s end, selects where the Program starts', () => {
  const args = greet.ast.find((node) => node.type === 'arguments')!.id;
  const dedent = greet.tokens.find((token) => token.type === 'DEDENT')!.id;

  for (const selection of [args, dedent]) {
    expect(describe(greet, selectionAt(greet, selection, 2))).toBe('byte d on line 1');
    expect(describe(greet, selectionAt(greet, selection, 5))).toBe('RESUME in code 0, run 1');
  }
  expect(describe(greet, selectionAt(greet, args, 3))).toBe('NAME def on line 1');
  expect(describe(greet, selectionAt(greet, dedent, 4))).toBe('Module');
});

test('a space between tokens selects the token after it', () => {
  // The space after the comma in print("Hello,", name).
  const space = greet.bytes.findIndex((byte, at) => byte.value === 0x20 && greet.bytes[at - 1]?.value === 0x2c);

  expect(describe(greet, selectionAt(greet, `byte-${space}`, 3))).toBe('NAME name on line 2');
});

test('a box selects the step with exactly its code first: the Call box, the step that calls', () => {
  const call = hello.ast.find((node) => node.type === 'Call')!.id;

  expect(describe(hello, selectionAt(hello, call, 5))).toBe('CALL in code 0, run 1');
});

test('levels 6 to 9 show the step run closest to the Selection, and keep a selected step run', () => {
  const print = hello.tokens.find((token) => token.text === 'print')!.id;
  const run = greet.runs[32].id;

  for (const level of [6, 7, 8, 9]) {
    expect(describe(hello, selectionAt(hello, print, level))).toBe('LOAD_NAME in code 0, run 1');
    expect(selectionAt(greet, run, level)).toBe(run);
  }
});

test('code outside every statement, such as a newline, selects the Module at level 4', () => {
  const newline = hello.bytes.at(-1)!.id;

  expect(describe(hello, selectionAt(hello, newline, 4))).toBe('Module');
});

/** The characters of the Program a Selection covers, as the editor highlights them. */
function highlighted(analysis: Analysis, id: string) {
  const chars = charsOf(analysis, id);
  return chars && Array.from(analysis.program).slice(chars.start, chars.end).join('');
}

test('the editor highlights the characters a Selection comes from, counting characters, not bytes', () => {
  const accented = python.analyze('print("café")');
  const text = accented.tokens.find((token) => token.type === 'STRING')!.id;
  const closing = accented.tokens.find((token) => token.text === ')')!.id;

  expect(highlighted(accented, text)).toBe('"café"');
  expect(highlighted(accented, closing)).toBe(')');
  // A byte of é is one of the two that store it.
  expect(highlighted(accented, `byte-${accented.bytes.findIndex((byte) => byte.value === 0xa9)}`)).toBe('é');
});

test('a step run highlights its step’s code, and a token with no characters highlights nothing', () => {
  const dedent = greet.tokens.find((token) => token.type === 'DEDENT')!.id;

  expect(highlighted(greet, greet.runs.find((run) => stepOfRun(greet, run).step.opname === 'LOAD_FAST_BORROW')!.id)).toBe('name');
  expect(highlighted(greet, dedent)).toBeNull();
});
