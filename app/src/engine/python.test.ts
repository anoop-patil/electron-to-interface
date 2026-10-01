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
  ]);
});

test('an error in the Program shows Python’s traceback, with the path where the browser’s Python saved the file', () => {
  const [result] = python.analyze('1 / 0').commands;

  expect(result.output).toBe(
    'Traceback (most recent call last):\n  File "/home/pyodide/program.py", line 1, in <module>\n    1 / 0\n    ~~^~~\nZeroDivisionError: division by zero\n',
  );
  expect(result.exitStatus).toBe(1);
});

test('for greet.py, the output of every command matches the output captured with CPython 3.14.2 on Linux, character for character', async () => {
  const captured = JSON.parse(await readFile('../prototype/data/example-greet-cpython-3.14.2.json', 'utf-8'));
  const { commands } = python.analyze(captured.source, captured.file);

  const outputs = Object.fromEntries(commands.map(({ command, output }) => [command, output]));
  expect(outputs).toEqual({
    'python greet.py': captured.commands.run,
    [`python -c "print(list(open('greet.py', 'rb').read()))"`]: captured.commands.bytes,
  });
});
