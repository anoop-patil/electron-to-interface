// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, expect, test } from 'vitest';
import { startPython, type Python } from '../engine/python';
import type { Analysis } from '../generated/analysis';
import type { Span } from './explain';
import { countPixels, explainLevel9, level9, screenPixels } from './pixels';

let python: Python;
let greet: Analysis;
let hello: Analysis;

const plain = (spans: Span[] | undefined) => (spans ?? []).map((span) => span.text).join('');

beforeAll(async () => {
  python = await startPython();
  const captured = JSON.parse(await readFile('../prototype/data/example-greet-cpython-3.14.2.json', 'utf-8'));
  greet = python.analyze(captured.source, captured.file);
  hello = python.analyze('print("Hello World!")');
}, 60_000);

/** What level 9 says about one character: its title and its text. */
function at(analysis: Analysis, id: string | null) {
  const { title, text } = explainLevel9(level9(analysis, id)!);
  return { title: plain(title), text: plain(text) };
}

test('hello world’s characters come from its real output, and H is byte 72', () => {
  const view = level9(hello, null)!;

  expect(view.lines.map((line) => line.text)).toEqual(['Hello World!']);
  expect(view.characters.join('')).toBe('Hello World!');
  expect(view).toMatchObject({ at: 0, character: 'H', bytes: [72] });
  expect(at(hello, null)).toEqual({
    title: 'How H becomes pixels',
    text: 'Your terminal looks up H in its font. The font stores each character as an outline, the blue line. The outline is laid over a grid of pixels: pixels fully inside it are lit, and pixels it only partly covers get a shade of gray. That softening is called anti-aliasing.',
  });
});

test('a space gets its own note: it lights no pixels', () => {
  const view = level9(greet, 'px-1-6')!;

  expect(view.line.text).toBe('Hello, Grace');
  expect(view.character).toBe(' ');
  expect(at(greet, 'px-1-6')).toEqual({
    title: 'A space lights no pixels',
    text: 'The terminal still gives the space a full cell, as wide as every other character, but leaves it dark.',
  });
});

test('a character stored in several bytes, or made of several code points, is one character', () => {
  const accented = python.analyze('print("café 👍🏽")');
  const view = level9(accented, 'px-0-3')!;

  expect(view.characters).toEqual(['c', 'a', 'f', 'é', ' ', '👍🏽']);
  expect(view.bytes).toEqual([195, 169]);
  expect(at(accented, 'px-0-3').text).toContain('In UTF-8 it takes 2 bytes, 195 169. The terminal reads them together, as one character.');
  expect(level9(accented, 'px-0-5')!.bytes).toHaveLength(8);
});

test('a tab lights no pixels either, and an empty line has no character to draw', () => {
  expect(at(python.analyze('print("a\\tb")'), 'px-0-1').title).toBe('A tab lights no pixels');
  const empty = python.analyze('print()\nprint("a")');
  const view = level9(empty, 'px-0-0')!;

  expect(view).toMatchObject({ at: null, character: null, bytes: [] });
  expect(at(empty, 'px-0-0').title).toBe('This line is empty');
});

test('a traceback’s line is drawn too, with a note that a terminal colors it', () => {
  const failing = python.analyze('1 / 0');
  const last = level9(failing, null)!.lines.at(-1)!;

  expect(last.text).toBe('ZeroDivisionError: division by zero');
  expect(at(failing, `px-${last.id.slice(4)}-0`).text).toContain('In a terminal, this line is in color');
});

test('a Program that printed nothing has nothing to draw', () => {
  expect(level9(python.analyze('x = 1'), null)).toBeNull();
});

test('pixels are fully lit, partly lit or dark, by how much ink the browser gave them', () => {
  expect(countPixels([0, 255, 128, 255, 0, 1])).toEqual({ lit: 2, partly: 2, dark: 2 });
});

test('the screen’s size is what the browser reports, in the screen’s own pixels', () => {
  expect(screenPixels({ width: 1280, height: 800 }, 2)).toEqual({ width: 2560, height: 1600, millions: '4.1' });
  expect(screenPixels({ width: 1536, height: 864 }, 1.25)).toEqual({ width: 1920, height: 1080, millions: '2.1' });
});
