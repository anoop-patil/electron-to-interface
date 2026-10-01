import { expect, test } from 'vitest';
import { analysisOf } from '../testAnalysis';
import { mapState } from './mapState';

/** Each lit part, with its note as plain text. */
const lit = (state: ReturnType<typeof mapState>) =>
  Object.fromEntries(state.lit.map(({ part, note }) => [part, note?.map((span) => span.text).join('') ?? '']));

const hello = analysisOf('print("Hello World!")\n');

test('at zoom levels 1 and 2, RAM is lit: the app keeps the Program in memory, never in a file on the disk', () => {
  expect(lit(mapState({ level: 1, analysis: hello, selection: null }))).toEqual({ ram: 'your program · 1 line' });
  expect(lit(mapState({ level: 2, analysis: hello, selection: 'byte-3' }))).toEqual({ ram: 'your program · 22 characters' });
});

test('the note counts characters, not UTF-8 bytes: RAM doesn’t hold the Program as UTF-8', () => {
  // Zoë and its newline are 4 characters, but 5 bytes in UTF-8.
  expect(lit(mapState({ level: 2, analysis: analysisOf('Zoë\n'), selection: null }))).toEqual({ ram: 'your program · 4 characters' });
});

test('nothing is lit before the first Run, or at a zoom level that isn’t built yet', () => {
  expect(mapState({ level: 1, analysis: null, selection: null }).lit).toEqual([]);
  for (let level = 3; level <= 9; level++) expect(mapState({ level, analysis: hello, selection: null }).lit).toEqual([]);
});
