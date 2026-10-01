// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { beforeAll, expect, test } from 'vitest';
import schema from '../../schema/analysis.schema.json';
import { startPython, type Python } from './python';

let python: Python;

beforeAll(async () => {
  python = await startPython();
}, 60_000);

test('the analysis comes from Python 3.14.2, the version the Reference Library is built from', () => {
  expect(python.analyze('print("Hello World!")').pythonVersion).toBe('3.14.2');
});

test('the analysis Pyodide produces matches the schema', () => {
  const analysis = python.analyze('name = "Zoë"\nfor i in range(2):\n    print(name, i)');

  const validate = new Ajv2020({ strict: true }).compile(schema);
  expect(validate(analysis), JSON.stringify(validate.errors)).toBe(true);
});

test('hello world is 22 bytes, from p to the newline', () => {
  const { bytes } = python.analyze('print("Hello World!")');

  expect(bytes).toHaveLength(22);
  expect(bytes[0]).toMatchObject({ id: 'byte-0', value: 0x70 });
  expect(bytes[21]).toMatchObject({ id: 'byte-21', value: 0x0a });
});

test('the Try it yourself commands run on the Program, saved as program.py', () => {
  const { fileName, commands } = python.analyze('print("Hi")');

  expect(fileName).toBe('program.py');
  expect(commands).toEqual([
    { command: 'python program.py', output: 'Hi\n', exitStatus: 0 },
    { command: `python -c "print(list(open('program.py', 'rb').read()))"`, output: '[112, 114, 105, 110, 116, 40, 34, 72, 105, 34, 41, 10]\n', exitStatus: 0 },
    {
      command: 'python -m tokenize program.py',
      output: [
        "0,0-0,0:            ENCODING       'utf-8'        ",
        "1,0-1,5:            NAME           'print'        ",
        "1,5-1,6:            OP             '('            ",
        `1,6-1,10:           STRING         '"Hi"'         `,
        "1,10-1,11:          OP             ')'            ",
        "1,11-1,12:          NEWLINE        '\\n'           ",
        "2,0-2,0:            ENDMARKER      ''             ",
      ].map((line) => `${line}\n`).join(''),
      exitStatus: 0,
    },
  ]);
});

test('hello world is six tokens, each a Fact with its place and its bytes', () => {
  const { tokens, encoding } = python.analyze('print("Hello World!")');

  expect(encoding).toBe('utf-8');
  expect(tokens.map(({ type, text }) => `${type} ${text}`)).toEqual(['NAME print', 'OP (', 'STRING "Hello World!"', 'OP )', 'NEWLINE \n', 'ENDMARKER ']);
  expect(tokens[0]).toEqual({ id: 'tok-0', type: 'NAME', exactType: 'NAME', text: 'print', start: { line: 1, column: 0 }, end: { line: 1, column: 5 }, span: { start: 0, end: 5 } });
});

test('for greet.py, the tokens match the capture of prototype v8, with INDENT, DEDENT and NL where blocks and lines end', async () => {
  const captured = JSON.parse(await readFile('../prototype/data/example-greet-cpython-3.14.2.json', 'utf-8'));
  const { tokens } = python.analyze(captured.source, captured.file);

  // The capture also lists tokenize's ENCODING token, which the Analysis records as `encoding`.
  expect(tokens.map(({ type, exactType, text, start, end, span }) => ({ type, exact: exactType, text, start: [start.line, start.column], end: [end.line, end.column], span: [span.start, span.end] }))).toEqual(
    captured.tokens.slice(1),
  );
});

test('an error in the Program shows Python’s traceback, with the path where the browser’s Python saved the file', () => {
  const [result] = python.analyze('1 / 0').commands;

  expect(result.output).toBe(
    'Traceback (most recent call last):\n  File "/home/pyodide/program.py", line 1, in <module>\n    1 / 0\n    ~~^~~\nZeroDivisionError: division by zero\n',
  );
  expect(result.exitStatus).toBe(1);
});

test('the Program runs: hello world prints Hello World!', () => {
  const analysis = python.analyze('print("Hello World!")');

  expect(analysis).toMatchObject({ stdout: 'Hello World!\n', stderr: '', error: null, eventsCutShort: false, runsCutShort: false });
});

test('an error stops the Program, with Python’s traceback on stderr', () => {
  const analysis = python.analyze('print("before")\n1 / 0');

  expect(analysis.stdout).toBe('before\n');
  expect(analysis.stderr).toBe(
    'Traceback (most recent call last):\n  File "/home/pyodide/program.py", line 2, in <module>\n    1 / 0\n    ~~^~~\nZeroDivisionError: division by zero\n',
  );
  expect(analysis.error).toEqual({ type: 'ZeroDivisionError', message: 'division by zero', line: 2 });
});

test('Events record each call, line and return, with the variables at that moment', () => {
  const { events } = python.analyze('def double(n):\n    return n * 2\n\nx = double(3)');

  expect(events.map(({ kind, line }) => `${kind} ${line}`)).toEqual(['call 1', 'line 1', 'line 4', 'call 1', 'line 2', 'return 2', 'return 4']);
  expect(events[5]).toEqual({ id: 'ev-5', kind: 'return', code: 1, line: 2, locals: { n: '3' }, value: '6' });
});

test('a long run keeps the first 2,000 Events and step runs, and says so', () => {
  const analysis = python.analyze('for i in range(5000):\n    pass\nprint("done")');

  expect(analysis.runs).toHaveLength(2000);
  expect(analysis.events).toHaveLength(2000);
  expect(analysis).toMatchObject({ runsCutShort: true, eventsCutShort: true, stdout: 'done\n' });
});

test('for greet.py, the step runs match the capture of prototype v8, with RESUME added where each code object starts', async () => {
  const captured = JSON.parse(await readFile('../prototype/data/example-greet-cpython-3.14.2.json', 'utf-8'));
  const { runs, stdout } = python.analyze(captured.source, captured.file);

  // The code objects in the order a step run counts them: the file's own, then greet.
  const names = ['<module>', 'greet'];
  const ran = runs.map(({ code, offset, printed }) => ({ code: names[code], off: offset, ...(printed && { printed }) }));
  expect(ran.filter(({ off }) => off !== 0)).toEqual(captured.ran);
  expect(ran.filter(({ off }) => off === 0)).toEqual([{ code: '<module>', off: 0 }, { code: 'greet', off: 0 }, { code: 'greet', off: 0 }]);
  expect(runs).toHaveLength(42);
  expect(stdout).toBe(captured.stdout);
});

test('for greet.py, the output of every command matches the output captured with CPython 3.14.2 on Linux, character for character', async () => {
  const captured = JSON.parse(await readFile('../prototype/data/example-greet-cpython-3.14.2.json', 'utf-8'));
  const { commands } = python.analyze(captured.source, captured.file);

  const outputs = Object.fromEntries(commands.map(({ command, output }) => [command, output]));
  expect(outputs).toEqual({
    'python greet.py': captured.commands.run,
    [`python -c "print(list(open('greet.py', 'rb').read()))"`]: captured.commands.bytes,
    'python -m tokenize greet.py': captured.commands.tokenize,
  });
});
