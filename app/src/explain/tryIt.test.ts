import { expect, test } from 'vitest';
import type { CommandRun } from '../generated/analysis';
import { GREET_OUTPUT, greetAnalysis, helloWorld, analysisOf as programAnalysis } from '../testAnalysis';
import type { Span } from './explain';
import { explainTryIt, tryItCommands } from './tryIt';

const RUN = 'python program.py';
const BYTES = `python -c "print(list(open('program.py', 'rb').read()))"`;
const TOKENIZE = 'python -m tokenize program.py';
const AST = 'python -m ast program.py';

/** An Analysis of the Program, with what each command printed: nothing, unless `printed` says otherwise. */
const analysisOf = (program: string, printed: Record<string, Omit<CommandRun, 'command'>> = {}) =>
  programAnalysis(program, tryItCommands('program.py').map((command) => ({ command, ...(printed[command] ?? { output: '', exitStatus: 0 }) })));

const plain = (spans: Span[] | undefined) => spans?.map((span) => span.text).join('');

test('levels 1 to 4 have a command for the learner’s file; the others aren’t built yet', () => {
  expect(tryItCommands('program.py')).toEqual([RUN, BYTES, TOKENIZE, AST]);
  expect(tryItCommands('greet.py')).toEqual([
    'python greet.py',
    `python -c "print(list(open('greet.py', 'rb').read()))"`,
    'python -m tokenize greet.py',
    'python -m ast greet.py',
  ]);
  expect(explainTryIt(5, analysisOf('x = 1\n'))).toBeNull();
});

test('level 1 runs the file and shows what the Program printed', () => {
  const hello = analysisOf('print("Hello World!")\n', { [RUN]: { output: 'Hello World!\n', exitStatus: 0 } });
  const tryIt = explainTryIt(1, hello)!;

  expect(tryIt.command).toBe('python program.py');
  expect(plain(tryIt.intro)).toBe('Save your program in a file called program.py, open a terminal in the same folder, and type:');
  expect(tryIt.intro).toContainEqual({ text: 'terminal', concept: 'terminal' });
  expect(tryIt.parts.map((part) => part.code)).toEqual(['python', 'program.py']);
  expect(tryIt.output).toBe('Hello World!\n');
  expect(tryIt.read.map(plain)).toEqual([
    'Each line here is a line your program printed, in order.',
    'Type your program exactly as it is here, with the same spaces, and press Enter after the last line before you save. Then your file holds the same 22 bytes that zoom level 2 shows.',
  ]);
});

test('level 1 says when the Program printed nothing, and explains a traceback when it stopped with an error', () => {
  expect(explainTryIt(1, analysisOf('x = 1\n'))!.read).toHaveLength(1);

  const error = analysisOf('1 / 0\n', {
    [RUN]: { output: 'Traceback (most recent call last):\n  File "/home/pyodide/program.py", line 1, in <module>\n    1 / 0\n    ~~^~~\nZeroDivisionError: division by zero\n', exitStatus: 1 },
  });
  expect(plain(explainTryIt(1, error)!.read[0])).toBe(
    'Your program stopped with an error. The last line names the error and says what went wrong; the lines above it say where. The path is where your browser’s Python saved program.py. On your computer, you’ll see your own folder.',
  );
});

test('level 2 prints the bytes, and lists which line each run of numbers comes from', () => {
  const program = 'def f():\n    pass\n\n  \n';
  const tryIt = explainTryIt(2, analysisOf(program, { [BYTES]: { output: '[100, …]\n', exitStatus: 0 } }))!;

  expect(tryIt.command).toBe(BYTES);
  expect(tryIt.parts.map((part) => part.code)).toEqual([`python -c "…"`, `open('program.py', 'rb')`, '.read()', 'list(…)', 'print(…)']);
  expect(tryIt.output).toBe('[100, …]\n');
  expect(tryIt.rows.map((row) => [row.printed, plain(row.text)])).toEqual([
    ['100, 101, 102, 32, 102, 40, 41, 58, 10', 'line 1: def f():, then the newline, 10'],
    ['32, 32, 32, 32, 112, 97, 115, 115, 10', 'line 2: 4 spaces, then pass, then the newline, 10'],
    ['10', 'line 3: empty, so just the newline, 10'],
    ['32, 32, 10', 'line 4: 2 spaces, then the newline, 10'],
  ]);
  expect(tryIt.rows[2].text).toContainEqual({ text: 'newline', concept: 'newline' });
});

test('a value from the Program is never read as markup', () => {
  const tryIt = explainTryIt(2, analysisOf('x = 2 ** 3  # [[byte|b]] {file}\n'))!;

  expect(plain(tryIt.rows[0].text)).toBe('line 1: x = 2 ** 3  # [[byte|b]] {file}, then the newline, 10');
  expect(tryIt.rows[0].text.filter((span) => span.strong || span.concept)).toEqual([]);
});

test('the What you’ll see tab says the browser’s Python ran the command on the Program', () => {
  expect(plain(explainTryIt(1, analysisOf('x = 1\n'))!.observed)).toBe('Your browser’s Python did what this command does, on your program, just now.');
  expect(plain(explainTryIt(1, analysisOf('x = 1\n'))!.nothingPrinted)).toBe('Nothing: your program doesn’t print anything, so the terminal shows nothing either.');
});

test('a Program that ends itself with sys.exit and a message gets no note saying it printed that message', () => {
  const exit = analysisOf('raise SystemExit("bye")\n', { [RUN]: { output: 'bye\n', exitStatus: 1 } });

  expect(explainTryIt(1, exit)!.read.map(plain)).toEqual([expect.stringMatching(/^Type your program exactly/)]);
});

test('level 2 explains numbers above 127 and tabs, but only when the Program has them', () => {
  const read = (program: string) => explainTryIt(2, analysisOf(program))!.read.map(plain);

  expect(read('s = "Zoë"\nif s:\n\tprint(s)\n')).toEqual([
    'Numbers from 128 to 255 come in groups of 2 to 4. UTF-8 stores each character beyond English letters and common symbols that way: ë is 195 171.',
    'Each tab is 9.',
    'Each space is 32. The newline is 10.',
    'Some Windows editors end each line with two bytes, 13 then 10. If yours does, your list has a 13 before every 10.',
  ]);
  expect(read('x = 1\n')).toHaveLength(2);
});

test('level 3 lists the tokens, and explains the first line of each kind, in prototype v8’s words', () => {
  const tryIt = explainTryIt(3, greetAnalysis([{ command: TOKENIZE, output: GREET_OUTPUT.tokenize, exitStatus: 0 }]))!;

  expect(tryIt.command).toBe(TOKENIZE);
  expect(plain(tryIt.intro)).toBe('Ask Python’s tokenizer to list the tokens it finds in your file:');
  expect(tryIt.parts.map((part) => [part.code, plain(part.text)])).toEqual([
    ['python -m tokenize', 'Run tokenize, the tokenizer that comes with Python, as a program.'],
    ['program.py', 'The file to read.'],
  ]);
  expect(tryIt.output).toBe(GREET_OUTPUT.tokenize);
  expect(tryIt.rows.map((row) => [row.printed, plain(row.text)])).toEqual([
    ["0,0-0,0:  ENCODING  'utf-8'", 'Not a place in your file: Python’s note of the encoding it read your bytes with.'],
    [
      "1,0-1,3:  NAME  'def'",
      'Line 1, columns 0 to 2. In each pair, the first number is the line and the second is the column. The end is the first column after the token. Columns count from 0.',
    ],
    ["1,16-1,17:  NEWLINE  '\\n'", 'The end of a complete line of code.'],
    ["2,0-2,4:  INDENT  '    '", 'The 4 spaces at the start of line 2: a block starts here.'],
    ["3,0-3,1:  NL  '\\n'", 'Line 3’s newline is an NL, not a NEWLINE: it ends a line on the screen, but not a line of code.'],
    ["4,0-4,0:  DEDENT  ''", 'An empty token: a block has ended, because line 4 starts further left.'],
    ["6,0-6,0:  ENDMARKER  ''", 'The file has ended, so the token is empty.'],
  ]);
  expect(tryIt.read.map(plain)).toEqual(['After ENCODING, each line is one of the tokens at this zoom level, in the same order.']);
});

test('level 3 explains only the kinds of token the Program has', () => {
  const output = [
    "0,0-0,0:            ENCODING       'utf-8'        ",
    "1,0-1,5:            NAME           'print'        ",
    "1,5-1,6:            OP             '('            ",
    `1,6-1,20:           STRING         '"Hello World!"'`,
    "1,20-1,21:          OP             ')'            ",
    "1,21-1,22:          NEWLINE        '\\n'           ",
    "2,0-2,0:            ENDMARKER      ''             ",
  ].map((line) => `${line}\n`).join('');
  const hello = helloWorld([{ command: TOKENIZE, output, exitStatus: 0 }]);

  expect(explainTryIt(3, hello)!.rows.map((row) => row.printed)).toEqual([
    "0,0-0,0:  ENCODING  'utf-8'",
    "1,0-1,5:  NAME  'print'",
    "1,21-1,22:  NEWLINE  '\\n'",
    "2,0-2,0:  ENDMARKER  ''",
  ]);
});

test('level 3 explains no lines when tokenize’s output doesn’t match the Program’s tokens', () => {
  const tryIt = explainTryIt(3, helloWorld([{ command: TOKENIZE, output: "0,0-0,0:            ENCODING       'utf-8'        \n", exitStatus: 0 }]))!;

  expect(tryIt.rows).toEqual([]);
  expect(tryIt.read).toEqual([]);
});

test('when tokenize stops with an error, level 3 shows what it printed and explains no lines', () => {
  const error = 'program.py:1:0: error: unexpected EOF in multi-line statement\n';
  const tryIt = explainTryIt(3, analysisOf('print("Hi"\n', { [TOKENIZE]: { output: error, exitStatus: 1 } }))!;

  expect(tryIt.output).toBe(error);
  expect(tryIt.rows).toEqual([]);
  expect(tryIt.read).toEqual([]);
});

test('level 4 runs python -m ast and explains the first box of each kind, as v8 did for greet.py', () => {
  const tryIt = explainTryIt(4, greetAnalysis([{ command: AST, output: GREET_OUTPUT.ast, exitStatus: 0 }]))!;

  expect(tryIt.command).toBe('python -m ast program.py');
  expect(plain(tryIt.intro)).toBe('Ask Python to print the structure of your file as text:');
  expect(tryIt.parts.map((part) => part.code)).toEqual(['python -m ast', 'program.py']);
  expect(tryIt.output).toBe(GREET_OUTPUT.ast);
  expect(tryIt.rows.map((row) => [row.printed, plain(row.text)])).toEqual([
    ['Module(body=[…])', 'Your program. body is its list of statements: here, 2 statements.'],
    ["FunctionDef(name='greet', args=…, body=[…])", 'The function: its name, what it takes, and its own list of statements.'],
    ["arg(arg='name')", 'The one thing greet takes: name.'],
    ['Expr(value=…)', 'One statement. value is what it does.'],
    ['Call(func=…, args=[…])', 'A call: func is what to call, and args is what to give it.'],
    ["Name(id='print', ctx=Load())", 'A name: id is the name itself. ctx=Load() means the name is read.'],
    ["Constant(value='Hello,')", 'A fixed value: value is the value, as Python writes it.'],
    ['For(target=…, iter=…, body=[…])', 'The loop: target is the name each item gets, iter is what to go through, body is what to do each time.'],
    ["Name(id='person', ctx=Store())", 'A name being stored: ctx=Store() means the name is given a value.'],
  ]);
  expect(tryIt.read.map(plain)).toEqual([
    'Each name followed by brackets, such as Call(…), is one of the boxes at this zoom level, in the same order. The exceptions are Load(), Store() and Del(), and operators such as Add() or Lt(): each says what the box around it does.',
    'The indentation shows which box sits inside which.',
  ]);
});

test('when the Program has a syntax error, level 4 shows what python -m ast printed and explains no lines', () => {
  const error = "Traceback (most recent call last):\n  …\nSyntaxError: '(' was never closed\n";
  const tryIt = explainTryIt(4, analysisOf('print("Hi"\n', { [AST]: { output: error, exitStatus: 1 } }))!;

  expect(tryIt.output).toBe(error);
  expect(tryIt.rows).toEqual([]);
  expect(tryIt.read).toEqual([]);
});
