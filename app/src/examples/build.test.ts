// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, expect, test } from 'vitest';
import { startPython } from '../engine/python';
import { exampleOf } from '../explain/reference';
import type { Analysis } from '../generated/analysis';
import { analyzeExamples } from './build';
import { EXAMPLES } from './examples';

let analyses: Analysis[];

beforeAll(async () => {
  analyses = await analyzeExamples(await startPython());
}, 120_000);

test('each Example’s Analysis is made by Python 3.14.2, for its own Program, and says which Example it is', async () => {
  expect(analyses.map(({ example }) => example)).toEqual(EXAMPLES.map(({ id }) => id));
  for (const [at, { source }] of EXAMPLES.entries()) {
    expect(analyses[at].program).toBe(await readFile(source, 'utf-8'));
    expect(analyses[at].pythonVersion).toBe('3.14.2');
  }
});

test('each Example runs to the end and prints, so every zoom level has something to show', () => {
  for (const analysis of analyses) {
    expect(analysis, analysis.example).toMatchObject({ error: null, stderr: '', runsCutShort: false, eventsCutShort: false, writesCutShort: false });
    expect(analysis.stdout, analysis.example).not.toBe('');
  }
});

test('hello world and greet.py match the step runs the Reference Library recorded, so levels 6 and 7 show them', () => {
  expect(analyses.filter((analysis) => exampleOf(analysis)).map(({ example }) => example)).toEqual(['hello', 'greet']);
});

test('an Analysis that breaks the schema fails the build, naming the Example', async () => {
  const broken = { analyze: (code: string) => ({ program: code }) as unknown as Analysis };

  await expect(analyzeExamples(broken)).rejects.toThrow(/^The Example hello’s Analysis breaks the schema:/);
});
