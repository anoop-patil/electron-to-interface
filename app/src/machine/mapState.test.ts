import { expect, test } from 'vitest';
import { analysisOf, helloWorld } from '../testAnalysis';
import { mapState } from './mapState';

/** Each lit part, with its note as plain text. */
const lit = (state: ReturnType<typeof mapState>) =>
  Object.fromEntries(state.lit.map(({ part, note }) => [part, note?.map((span) => span.text).join('') ?? '']));

const hello = helloWorld();

test('at zoom levels 1 and 2, RAM is lit: the app keeps the Program in memory, never in a file on the disk', () => {
  expect(lit(mapState({ level: 1, analysis: hello, selection: null }))).toEqual({ ram: 'your program · 1 line' });
  expect(lit(mapState({ level: 2, analysis: hello, selection: 'byte-3' }))).toEqual({ ram: 'your program · 22 characters' });
});

test('the note counts characters, not UTF-8 bytes: RAM doesn’t hold the Program as UTF-8', () => {
  // Zoë and its newline are 4 characters, but 5 bytes in UTF-8.
  expect(lit(mapState({ level: 2, analysis: analysisOf('Zoë\n'), selection: null }))).toEqual({ ram: 'your program · 4 characters' });
});

test('at zoom level 3, RAM is lit: the Program, now read as tokens, not copied from a file on the disk', () => {
  expect(lit(mapState({ level: 3, analysis: hello, selection: 'tok-0' }))).toEqual({ ram: 'your program · read as 6 tokens' });
});

test('at zoom level 4, RAM is lit: the Program, now as boxes, which Python keeps only until it has made the bytecode', () => {
  expect(lit(mapState({ level: 4, analysis: hello, selection: 'ast-0' }))).toEqual({ ram: 'your program · as 5 boxes, temporary' });
});

test('nothing is lit before the first Run', () => {
  expect(mapState({ level: 1, analysis: null, selection: null }).lit).toEqual([]);
});

test('at zoom level 9, the screen is lit, with its size in pixels as the browser reports it', () => {
  const screen = { width: 2560, height: 1600, millions: '4.1' };

  expect(lit(mapState({ level: 9, analysis: hello, selection: null, screen }))).toEqual({ screen: '2560 × 1600 pixels' });
  expect(lit(mapState({ level: 9, analysis: hello, selection: null }))).toEqual({ screen: '' });
});
