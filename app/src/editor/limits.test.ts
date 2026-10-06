import { expect, test } from 'vitest';
import schema from '../../schema/analysis.schema.json';
import type { Analysis } from '../generated/analysis';
import { analysisOf } from '../testAnalysis';
import { fileNameFor, importNote, lineLimitNote } from './limits';

const lines = (count: number) => Array.from({ length: count }, (_, at) => `n = ${at}`).join('\n');

test('a Program of up to 20 lines fits, counting blank lines but not the newline that ends the last one', () => {
  expect(lineLimitNote(lines(20))).toBeNull();
  expect(lineLimitNote(`${lines(20)}\n`)).toBeNull();
  expect(lineLimitNote(`${lines(19)}\n\n`)).toBeNull();
  expect(lineLimitNote('')).toBeNull();
});

test('over 20 lines, the note says how many lines to take out before Run works', () => {
  expect(lineLimitNote(lines(21))).toBe('Your program is 21 lines long. A program here can have up to 20, so Run is off until you take out 1 line.');
  expect(lineLimitNote(`${lines(20)}\n\n\n`)).toBe('Your program is 22 lines long. A program here can have up to 20, so Run is off until you take out 2 lines.');
});

test('an uploaded file keeps its name in the Try it yourself commands when the name is already safe to type', () => {
  expect(fileNameFor('greet.py')).toBe('greet.py');
  expect(fileNameFor('my-first_program.v2.py')).toBe('my-first_program.v2.py');
});

test('a name with spaces, quote marks or accents is rewritten with only letters, digits, _, . and -', () => {
  expect(fileNameFor('my program.py')).toBe('my_program.py');
  expect(fileNameFor(`Ada's "loop" (2).py`)).toBe('Ada_s_loop_2.py');
  expect(fileNameFor('Zoë café.py')).toBe('Zoe_cafe.py');
});

test('the name always ends in .py, never starts with - or ., and is never empty', () => {
  expect(fileNameFor('GREET.PY')).toBe('GREET.py');
  expect(fileNameFor('notes.txt')).toBe('notes.py');
  expect(fileNameFor('-v.py')).toBe('v.py');
  expect(fileNameFor('.hidden.py')).toBe('hidden.py');
  expect(fileNameFor('日本.py')).toBe('program.py');
  expect(fileNameFor('.py')).toBe('program.py');
  expect(fileNameFor(`${'a'.repeat(60)}.py`)).toBe(`${'a'.repeat(40)}.py`);
});

test('every name it makes is one the Analysis schema allows', () => {
  const allowed = new RegExp(schema.properties.fileName.pattern);
  for (const name of ['my program.py', `"'.py`, '-.py', 'a'.repeat(300), '…', ' .py ']) expect(fileNameFor(name)).toMatch(allowed);
});

test('a Program that stops importing a package outside the standard library says only the standard library is available', () => {
  const stopped = analysisOf('import numpy\n', [], {
    error: { type: 'ModuleNotFoundError', message: "No module named 'numpy'", line: 1, module: 'numpy', standardLibrary: false },
  });

  expect(importNote(stopped)).toBe(
    'Your program stopped on line 1 because it imports numpy, which isn’t part of Python’s standard library. Only the standard library is available here: it comes with the Python running in your browser, and nothing else can be installed.',
  );
});

test('only an import Python couldn’t find outside the standard library gets the note', () => {
  const stoppedBy = (error: Analysis['error']) => importNote(analysisOf('x\n', [], { error }));

  expect(stoppedBy(null)).toBeNull();
  expect(stoppedBy({ type: 'ZeroDivisionError', message: 'division by zero', line: 1 })).toBeNull();
  expect(stoppedBy({ type: 'ModuleNotFoundError', message: 'mine', line: 1 })).toBeNull();
  expect(stoppedBy({ type: 'ModuleNotFoundError', message: "No module named 'tkinter'", line: 1, module: 'tkinter', standardLibrary: true })).toBeNull();
});
