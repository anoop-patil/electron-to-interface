// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { LIBRARY } from '../explain/reference';
import { EXAMPLES } from './examples';

const programOf = (source: string) => readFile(source, 'utf-8');

test('the Examples are hello world, a for loop, greet.py, a list comprehension and a class, in that order', () => {
  expect(EXAMPLES.map(({ label }) => label)).toEqual(['hello world', 'for loop', 'function', 'list comprehension', 'class']);
  expect(EXAMPLES[2].source).toBe('../prototype/examples/greet.py');
});

test('apart from hello world, each Example is several lines long, within the 20-line limit, and ends with a newline', async () => {
  for (const { id, source } of EXAMPLES) {
    const program = await programOf(source);
    const lines = program.split('\n').length - 1;
    expect(program.endsWith('\n'), id).toBe(true);
    expect(lines, id).toBeLessThanOrEqual(20);
    if (id !== 'hello') expect(lines, id).toBeGreaterThan(3);
  }
});

test('every Example the Reference Library recorded is shipped, with the same Program, so levels 6 and 7 find it', async () => {
  const shipped = await Promise.all(EXAMPLES.map(({ source }) => programOf(source)));

  for (const { name, program } of LIBRARY.examples) expect(shipped, name).toContain(program);
});
