import { expect, test } from 'vitest';
import type { CommandRun } from '../generated/analysis';
import { analysisOf as programAnalysis } from '../testAnalysis';
import type { Span } from './explain';
import { explainTryIt, tryItCommands } from './tryIt';

const RUN = 'python program.py';
const BYTES = `python -c "print(list(open('program.py', 'rb').read()))"`;

/** An Analysis of the Program, with what each command printed: nothing, unless `printed` says otherwise. */
const analysisOf = (program: string, printed: Record<string, Omit<CommandRun, 'command'>> = {}) =>
  programAnalysis(program, tryItCommands('program.py').map((command) => ({ command, ...(printed[command] ?? { output: '', exitStatus: 0 }) })));

const plain = (spans: Span[] | undefined) => spans?.map((span) => span.text).join('');

test('levels 1 and 2 have a command for the learner’s file; the others aren’t built yet', () => {
  expect(tryItCommands('program.py')).toEqual([RUN, BYTES]);
  expect(tryItCommands('greet.py')).toEqual(['python greet.py', `python -c "print(list(open('greet.py', 'rb').read()))"`]);
  expect(explainTryIt(3, analysisOf('x = 1\n'))).toBeNull();
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
  expect(tryIt.rows.map((row) => [row.bytes, plain(row.text)])).toEqual([
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
