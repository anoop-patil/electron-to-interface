// @vitest-environment node
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
