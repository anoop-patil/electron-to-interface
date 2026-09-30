// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { compileFromFile } from 'json-schema-to-typescript';
import { expect, test } from 'vitest';

test('the TypeScript types are generated from the current schema (npm run gen:types)', async () => {
  const fromSchema = await compileFromFile('schema/analysis.schema.json');
  const committed = await readFile('src/generated/analysis.ts', 'utf-8');

  expect(committed).toBe(fromSchema);
});
