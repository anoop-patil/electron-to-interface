import { expect, test } from 'vitest';
import type { Analysis } from '../generated/analysis';
import { analysisOf } from '../testAnalysis';
import { closestLine, outputLines, systemCalls } from './output';

/** A piece or a flush, as the analyzer records them. */
type OutputWrite = Analysis['writes'][number];

/** An Analysis whose recorded run handed over these pieces. */
const wrote = (writes: OutputWrite[], cutShort = false) => analysisOf('x = 1\n', [], { writes, writesCutShort: cutShort });

/** The pieces print hands to sys.stdout for print(...things), each written by the given step run. */
const printed = (run: number, ...things: string[]): OutputWrite[] =>
  [...things.flatMap((thing, at) => (at === 0 ? [thing] : [' ', thing])), '\n'].map((text) => ({ door: 1, text, run }));

const calls = (writes: OutputWrite[], cutShort = false) => systemCalls(wrote(writes, cutShort)).map(({ door, text }) => [door, text]);

test('each print sends its line in one system call, when the piece holding its newline arrives', () => {
  const writes = [...printed(3, 'Hello,', 'Ada'), ...printed(9, 'Hello,', 'Grace')];

  expect(calls(writes)).toEqual([[1, 'Hello, Ada\n'], [1, 'Hello, Grace\n']]);
  expect(systemCalls(wrote(writes)).map((call) => call.bytes)).toEqual([11, 13]);
});

test('pieces without a newline wait for one, and a flush sends them early', () => {
  expect(calls([{ door: 1, text: 'a' }, { door: 1, text: '' }, { door: 1, text: 'b' }, { door: 1, text: '\n' }])).toEqual([[1, 'ab\n']]);
  expect(calls([{ door: 1, text: 'Loading' }, { door: 1, text: '' }, { door: 1, flush: true }, { door: 1, text: ' done\n' }])).toEqual([[1, 'Loading'], [1, ' done\n']]);
  // A flush sends then, even after a piece for the other door.
  expect(calls([{ door: 1, text: 'a' }, { door: 2, text: 'e\n' }, { door: 1, flush: true }])).toEqual([[2, 'e\n'], [1, 'a']]);
});

test('a buffer of 131,072 bytes, filled 8,192 bytes at a time, sends what it holds when it has no room for more', () => {
  const x = (count: number) => 'x'.repeat(count);
  const sizes = (writes: OutputWrite[]) => systemCalls(wrote(writes)).map(({ bytes, why }) => [bytes, why]);

  // As strace shows on CPython 3.14.2: print("x" * 10000) is one call, print("x" * 200000) two, and thirty
  // print("x" * 5000, end="") a call of 130,000 bytes, then one of 20,000 when the program stops.
  expect(sizes([{ door: 1, text: x(10000) }, { door: 1, text: '\n' }])).toEqual([[10001, 'newline']]);
  expect(sizes([{ door: 1, text: x(200000) }, { door: 1, text: '\n' }])).toEqual([[200000, 'full'], [1, 'newline']]);
  const thirty = Array.from({ length: 30 }, (): OutputWrite[] => [{ door: 1, text: x(5000) }, { door: 1, text: '' }]).flat();
  expect(sizes(thirty)).toEqual([[130000, 'full'], [20000, 'end']]);
});

test('a piece with a newline in the middle is sent whole, and a carriage return sends too', () => {
  expect(calls([{ door: 1, text: 'a\nb' }, { door: 1, text: '\n' }])).toEqual([[1, 'a\nb'], [1, '\n']]);
  expect(calls([{ door: 1, text: 'a\rb' }, { door: 1, text: '\n' }])).toEqual([[1, 'a\rb'], [1, '\n']]);
});

test('what is still waiting when the program stops is sent then, before Python reports an error', () => {
  const report = ['Traceback (most recent call last):\n', '\x1b[1;35mZeroDivisionError\x1b[0m: \x1b[35mdivision by zero\x1b[0m\n'];
  const writes: OutputWrite[] = [{ door: 1, text: 'x' }, ...report.map((text) => ({ door: 2 as const, text, report: true as const }))];

  expect(calls(writes)).toEqual([[1, 'x'], ...report.map((text) => [2, text])]);
  expect(calls([{ door: 1, text: 'x' }])).toEqual([[1, 'x']]);
  // Python flushes stderr first, then stdout.
  expect(calls([{ door: 1, text: 'a' }, { door: 2, text: 'b' }])).toEqual([[2, 'b'], [1, 'a']]);
});

test('each call says why Python sent it then', () => {
  const writes: OutputWrite[] = [
    { door: 1, text: 'a\n' },
    { door: 1, text: 'b\r' },
    { door: 1, text: 'c' },
    { door: 1, flush: true },
    { door: 1, text: 'd' },
  ];

  expect(systemCalls(wrote(writes)).map((call) => call.why)).toEqual(['newline', 'return', 'flush', 'end']);
});

test('bytes are counted in UTF-8', () => {
  expect(systemCalls(wrote(printed(0, 'héllo')))[0].bytes).toBe(7);
});

test('each line of output knows its door, its text, its bytes, its pieces and the calls that carried it', () => {
  const writes = [...printed(3, 'Hello,', 'Ada'), ...printed(9, 'Hello,', 'Grace')];

  expect(outputLines(wrote(writes))).toEqual([
    { id: 'out-0', door: 1, text: 'Hello, Ada', newline: true, sent: 'Hello, Ada\n', bytes: 11, colorBytes: 0, pieces: [0, 1, 2, 3], calls: [0], run: 3, report: false },
    { id: 'out-1', door: 1, text: 'Hello, Grace', newline: true, sent: 'Hello, Grace\n', bytes: 13, colorBytes: 0, pieces: [4, 5, 6, 7], calls: [1], run: 9, report: false },
  ]);
});

test('a line can share a call with others, or be sent in several', () => {
  const lines = outputLines(wrote([{ door: 1, text: 'a\nb', run: 2 }, { door: 1, text: '\n', run: 2 }]));

  expect(lines.map(({ text, pieces, calls }) => [text, pieces, calls])).toEqual([['a', [0], [0]], ['b', [0, 1], [0, 1]]]);
});

test('a last line without a newline is still a line', () => {
  expect(outputLines(wrote([{ door: 1, text: 'x', run: 1 }])).map(({ text, newline, bytes }) => [text, newline, bytes])).toEqual([['x', false, 1]]);
});

test('lines come in the order the calls that finish them happened, and a traceback is shown without its color codes', () => {
  const writes: OutputWrite[] = [
    { door: 1, text: 'x', run: 1 },
    { door: 2, text: 'Traceback (most recent call last):\n', report: true },
    { door: 2, text: '\x1b[1;35mZeroDivisionError\x1b[0m\n', report: true },
  ];

  expect(outputLines(wrote(writes)).map(({ door, text, bytes, colorBytes, run, report }) => [door, text, bytes, colorBytes, run, report])).toEqual([
    [1, 'x', 1, 0, 1, false],
    [2, 'Traceback (most recent call last):', 35, 0, null, true],
    [2, 'ZeroDivisionError', 29, 11, null, true],
  ]);
});

test('when the pieces were cut short, the line the cut fell in is left out', () => {
  const writes: OutputWrite[] = [{ door: 1, text: 'one\n', run: 1 }, { door: 1, text: 'tw', run: 2 }];

  expect(outputLines(wrote(writes, true)).map(({ text }) => text)).toEqual(['one']);
  expect(calls(writes, true)).toEqual([[1, 'one\n']]);
});

test('when the cut falls in the first line, there is no line to follow, though calls went out', () => {
  const writes: OutputWrite[] = [{ door: 1, text: 'a', run: 1 }, { door: 1, flush: true, run: 1 }, { door: 1, text: 'b', run: 2 }];

  expect(outputLines(wrote(writes, true))).toEqual([]);
  expect(calls(writes, true)).toEqual([[1, 'a']]);
});

test('a program that printed nothing has no lines', () => {
  expect(outputLines(wrote([]))).toEqual([]);
});

test('the line closest to a step run is the one it printed, else the next one printed after it, else the last', () => {
  const analysis = wrote([...printed(3, 'Hello,', 'Ada'), ...printed(9, 'Hello,', 'Grace'), { door: 2, text: 'oops\n', report: true }]);

  expect([3, 0, 5, 9, 12].map((run) => closestLine(analysis, run)?.id)).toEqual(['out-0', 'out-0', 'out-1', 'out-1', 'out-2']);
  expect(closestLine(wrote([]), 0)).toBeNull();
});
