// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, expect, test } from 'vitest';
import { startPython, type Python } from '../engine/python';
import type { Analysis } from '../generated/analysis';
import { mapState } from '../machine/mapState';
import type { Span } from './explain';
import { explainLevel8, level8, pythonRepr, straceString } from './operatingSystem';
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

/** What level 8 says at one stage of one line: its title, its text, and the stage's code. */
function at(analysis: Analysis, id: string) {
  const view = level8(analysis, id)!;
  const { title, text } = explainLevel8(analysis, view);
  return { title: plain(title), text: plain(text), code: view.stages[view.stage - 1].code, zone: view.zone, packet: view.packet };
}

test('hello world prints one line: 13 bytes, in one system call to door 1', () => {
  const view = level8(hello, null)!;

  expect(view.lines.map(({ text, bytes }) => [text, bytes])).toEqual([['Hello World!', 13]]);
  expect(view.stage).toBe(1);
  expect(view.stages.map((stage) => stage.code)).toEqual([
    `sys.stdout.write('Hello World!') · write('\\n')`,
    'UTF-8 → 72 101 108 108 111 32 87 111 114 108 100 33 10',
    'write(1, "Hello World!\\n", 13)',
    'kernel → terminal device',
    '13 bytes → "Hello World!" + a new line',
  ]);
  expect(at(hello, 'out-0-3').text).toBe(
    'This is a system call: Python asks the operating system to write 13 bytes to door number 1. The CPU switches into a special mode where only the operating system runs. Your program waits. Python makes 1 call like this for your program, one for each line. (In a Windows console, Python uses a different call, WriteConsoleW.)',
  );
});

test('greet.py’s two lines are 11 and 13 bytes, each one system call, with the packet moving zone by zone', () => {
  expect(level8(greet, null)!.lines.map(({ text, bytes, calls }) => [text, bytes, calls.length])).toEqual([['Hello, Ada', 11, 1], ['Hello, Grace', 13, 1]]);
  expect(at(greet, 'out-1-1')).toMatchObject({
    title: 'Your program hands the pieces to Python’s output object',
    code: `sys.stdout.write('Hello,') · write(' ') · write('Grace') · write('\\n')`,
    zone: 0,
    packet: 'Hello, Grace↵ · 13 bytes',
  });
  expect(at(greet, 'out-1-1').text).toContain('in 4 pieces');
  expect(at(greet, 'out-1-2').title).toBe('The text becomes 13 bytes and waits in a small buffer');
  expect(at(greet, 'out-1-3')).toMatchObject({ title: 'Python knocks on door number 1', zone: 1 });
  expect(at(greet, 'out-1-3').text).toContain('Python makes 2 calls like this for your program, one for each line.');
  expect(at(greet, 'out-1-4')).toMatchObject({ zone: 2, packet: '13 bytes' });
  expect(at(greet, 'out-1-5')).toMatchObject({ zone: 3, packet: 'Hello, Grace', code: '13 bytes → "Hello, Grace" + a new line' });
});

test('a traceback goes out through door 2, colored, so its lines carry color codes', () => {
  const failing = python.analyze('print("Hi")\n1 / 0');
  const { lines } = level8(failing, null)!;

  expect(lines.map(({ door, text }) => [door, text])).toEqual([
    [1, 'Hi'],
    [2, 'Traceback (most recent call last):'],
    [2, '  File "/home/pyodide/program.py", line 2, in <module>'],
    [2, '    1 / 0'],
    [2, '    ~~^~~'],
    [2, 'ZeroDivisionError: division by zero'],
  ]);
  const error = lines.at(-1)!;
  expect(at(failing, `${error.id}-1`).title).toBe('Python hands its report of the error to sys.stderr');
  expect(at(failing, `${error.id}-2`).text).toContain(`so ${error.colorBytes} bytes of them are color codes`);
  expect(at(failing, `${error.id}-3`).code).toMatch(/^write\(2, "\\33\[1;35mZeroDivisionError\\33\[0m: /);
  // The File line, its code and its carets went out in one call, as strace shows.
  expect(at(failing, 'out-2-3').text).toContain('This call carries more than this line');
});

test('a line with no newline waits until the program stops, or until it asks for a flush', () => {
  expect(at(python.analyze('print("x", end="")'), 'out-0-2').text).toContain('until your program stops');
  expect(at(python.analyze('print("x", end="", flush=True)\nx = 1'), 'out-0-2').text).toContain('until your program asks Python to send them');
  expect(at(python.analyze('print("x", end="")'), 'out-0-5').text).toContain('whatever comes next is drawn on the same line');
});

test('a line can go out in several calls, and a call can carry several lines', () => {
  const split = python.analyze('print("a\\nb")');

  expect(at(split, 'out-0-3').text).toContain('This call carries more than this line');
  expect(at(split, 'out-1-3').text).toContain('This line’s bytes went out in 2 calls; this is the last of them.');
  expect(at(split, 'out-1-3').text).toContain('Python makes 2 calls like this for your program in all.');
});

test('a line with no newline of its own, sent with the newline of the line before, says so', () => {
  expect(at(python.analyze('print("a\\nb", end="")'), 'out-1-2').text).toContain('they came in the same piece as the line before’s newline');
});

test('a traceback’s pieces are Derived: Python writes them after the Program stops, colored for a terminal', () => {
  const failing = python.analyze('print("Hi")\n1 / 0');

  expect(level8(failing, 'out-0-1')!.derived).toBe(false);
  expect(level8(failing, 'out-1-1')!.derived).toBe(true);
  expect(level8(failing, 'out-1-1')!.piecesNote).toBe('level8.observedReport');
  // Try it yourself shows only what was recorded as the Program ran.
  expect(explainTryIt(8, failing)!.output).toBe(`sys.stdout ← 'Hi'  '\\n'`);
});

test('a flush is a row of its own in Try it yourself', () => {
  expect(explainTryIt(8, python.analyze('print("Loading", end="", flush=True)\nprint(" done")'))!.output).toBe(
    `sys.stdout ← 'Loading'  ''\nsys.stdout.flush()\nsys.stdout ← ' done'  '\\n'`,
  );
});

test('a Program cut short before it finished a line has no line to follow, and says how many calls at least', () => {
  const long = python.analyze('for i in range(3000):\n    print(i, end=" ", flush=True)');

  expect(long.writesCutShort).toBe(true);
  expect(level8(long, null)).toBeNull();
  expect(mapState({ level: 8, analysis: long, selection: null }).lit.map(({ note }) => plain(note))).toEqual(['too much output to follow a whole line']);
  expect(plain(explainTryIt(8, long)!.rows[0].text)).toMatch(/Python makes at least \d+ calls\.$/);
});

test('a program that printed nothing has no line to follow', () => {
  expect(level8(python.analyze('x = 1'), null)).toBeNull();
});

test('the Machine map lights the operating system, and RAM while the bytes wait in the buffer', () => {
  const notes = (selection: string) => mapState({ level: 8, analysis: greet, selection }).lit.map(({ part, note }) => [part, plain(note)]);

  expect(notes('out-0-1')).toEqual([['os', 'not asked yet'], ['ram', '11 bytes waiting in a buffer']]);
  expect(notes('out-0-3')).toEqual([['os', 'door 1 → terminal · 11 bytes']]);
  expect(mapState({ level: 8, analysis: python.analyze('x = 1'), selection: null }).lit.map(({ part }) => part)).toEqual(['os']);
});

test('Python’s way of writing a piece, and strace’s way of writing bytes', () => {
  expect(pythonRepr('Hello,')).toBe(`'Hello,'`);
  expect(pythonRepr("it's\n")).toBe(`"it's\\n"`);
  expect(pythonRepr('\x1b[0m\\')).toBe(`'\\x1b[0m\\\\'`);
  expect(straceString('héllo "x"\n')).toBe('"h\\303\\251llo \\"x\\"\\n"');
  expect(straceString('\x1b[35m\x1b0')).toBe('"\\33[35m\\0330"');
  expect(pythonRepr('a b​')).toBe(`'a\\xa0b\\u200b'`);
  expect(straceString('\v\f')).toBe('"\\v\\f"');
});

test('for an Example, the pieces were recorded when the site was built, and level 8 and Try it yourself say so', () => {
  const example = { ...hello, example: 'hello' };

  expect(level8(hello, 'out-0-1')!.piecesNote).toBe('level8.observed');
  expect(level8(example, 'out-0-1')!.piecesNote).toBe('level8.built');
  expect(plain(explainTryIt(8, example)!.observed)).toBe(
    'Your browser can’t run strace. Python 3.14.2 (Pyodide, the Python this site runs) recorded each piece this Example handed to sys.stdout and sys.stderr, and each flush, when this site was built. A row ends with a piece that holds a newline, which in a terminal makes Python send a write call; a flush, which does too; or a change of door.',
  );
});

test('Try it yourself: strace, which a browser can’t run, beside the pieces the browser saw, and a sample', () => {
  const tryIt = explainTryIt(8, greet)!;

  expect(tryIt.command).toBe('strace -e trace=write python greet.py');
  expect(tryIt.output).toBe(`sys.stdout ← 'Hello,'  ' '  'Ada'  '\\n'\nsys.stdout ← 'Hello,'  ' '  'Grace'  '\\n'`);
  expect(plain(tryIt.observed)).toContain('Your browser can’t run strace');
  expect(tryIt.sample).toMatchObject({ command: 'strace -e trace=write python greet.py', output: 'write(1, "Hello, Ada\\n", 11)            = 11\nwrite(1, "Hello, Grace\\n", 13)          = 13\n+++ exited with 0 +++\n' });
  expect(tryIt.rows.map((row) => row.printed)).toEqual(['write(…)', '1', '"Hello, Ada\\n"', '11 and 13', '= 11', '+++ exited with 0 +++']);
  expect(plain(tryIt.rows[0].text)).toBe('The system call: “please write some bytes”. For your program, Python makes 2 calls.');
  expect(explainTryIt(8, hello)!.sample!.output).toBe('write(1, "Hello World!\\n", 13)          = 13\n+++ exited with 0 +++\n');
  // Any other Program gets greet.py's sample, and the rows of its own calls.
  const other = explainTryIt(8, python.analyze('import sys\nprint("x", file=sys.stderr)\nsys.exit(2)'))!;
  expect(other.sample!.command).toBe('strace -e trace=write python greet.py');
  expect(other.rows.map((row) => row.printed)).toEqual(['write(…)', '2', '"x\\n"', '2', '= 2', '+++ exited with 2 +++']);
});
