import type { Analysis, CharacterSlot, PixelsSlot } from '../generated/analysis';
import { selectionAt } from '../zoom/selection';
import { counted, fillString, template, type Explanation, type TemplateId } from './explain';
import { charactersOf, outputLines, pixelOf, type OutputLine } from './output';

/**
 * Zoom level 9's model: one character of a line of output, as a terminal draws it. The characters come from the
 * Program's real output (Observed); how a terminal draws them is Typical. The page draws the character live, in the
 * learner's browser, and enlarges it until each pixel is a square (`PixelsZoomLevel`).
 */

/** Zoom level 9's Selection, and what it shows for it. */
export interface Level9 {
  lines: OutputLine[];
  line: OutputLine;
  characters: string[];
  /** The selected character's place in `characters`, or null on an empty line, which has none. */
  at: number | null;
  character: string | null;
  /** The selected character's bytes in UTF-8. */
  bytes: number[];
}

/**
 * What zoom level 9 shows for the learner's Selection: every line of output, the one that follows from the Selection
 * (ADR 0007), and a character in it. Null if there is no line to draw.
 */
export function level9(analysis: Analysis, selection: string | null): Level9 | null {
  const id = selectionAt(analysis, selection, 9);
  const found = id && pixelOf(analysis, id);
  if (!found) return null;
  const characters = charactersOf(found.line);
  const character = characters[found.character] ?? null;
  return {
    lines: outputLines(analysis),
    line: found.line,
    characters,
    at: character === null ? null : found.character,
    character,
    bytes: character === null ? [] : Array.from(new TextEncoder().encode(character)),
  };
}

export function characterFacts({ character, bytes }: Level9): Record<CharacterSlot, string> {
  return { character: character ?? '', bytes: bytes.join(' '), byteCount: counted(bytes.length, 'byte', 'bytes') };
}

/** A character a terminal draws no ink for: a space, a tab or another kind of space. */
export const isBlank = (character: string) => /^\s+$/.test(character);

/** The Templates that explain a character: the first gives the title, and the rest add sentences, in order. */
function characterTemplates({ line, character, bytes }: Level9): TemplateId[] {
  const colored: TemplateId[] = line.colorBytes > 0 ? ['level9.colored'] : [];
  if (character === null) return ['level9.empty'];
  if (character === '\t') return ['level9.tab', ...colored];
  if (isBlank(character)) return ['level9.space', ...colored];
  return ['level9.character', ...(bytes.length > 1 ? ['level9.characterBytes' as const] : []), ...colored];
}

/** The Explanation of the selected character: its title, and its sentences, filled in with its Facts. */
export function explainLevel9(view: Level9): Explanation {
  const facts = characterFacts(view);
  const [first, ...more] = characterTemplates(view).map((id) => template(id, 'character'));
  return {
    title: fillString(first.title!, facts),
    text: [first, ...more].flatMap((found, at) => [...(at > 0 ? [{ text: ' ' }] : []), ...fillString(found.text, facts)]),
  };
}

/** How a character's cell came out: how many pixels the browser lit fully, partly, or not at all. */
export interface PixelCounts {
  lit: number;
  partly: number;
  dark: number;
}

/** Counts a cell's pixels by how much ink the browser gave each, from 0, none, to 255, full. */
export function countPixels(ink: ArrayLike<number>): PixelCounts {
  const counts = { lit: 0, partly: 0, dark: 0 };
  for (let at = 0; at < ink.length; at++) {
    if (ink[at] === 255) counts.lit++;
    else if (ink[at] > 0) counts.partly++;
    else counts.dark++;
  }
  return counts;
}

/**
 * The screen's size in its own pixels: the size the browser reports, in CSS pixels, times its device pixel ratio. Page
 * zoom changes the ratio, and in some browsers, such as Chrome, not the size, so on a zoomed page this is off by the zoom.
 */
export function screenPixels(screen: { width: number; height: number }, ratio: number) {
  const width = Math.round(screen.width * ratio);
  const height = Math.round(screen.height * ratio);
  return { width, height, millions: ((width * height) / 1e6).toFixed(1) };
}

export type ScreenPixels = ReturnType<typeof screenPixels>;

/** What the browser drew and reports, as a pixels Template's Facts. A slot nothing filled in is empty. */
export function pixelsFacts(screen: ScreenPixels | null, cell?: { width: number; height: number; counts: PixelCounts }): Record<PixelsSlot, string> {
  const pixels = (count: number | undefined) => (count === undefined ? '' : counted(count, 'pixel', 'pixels'));
  return {
    cellWidth: cell ? String(cell.width) : '',
    cellHeight: cell ? String(cell.height) : '',
    lit: pixels(cell?.counts.lit),
    partly: pixels(cell?.counts.partly),
    dark: pixels(cell?.counts.dark),
    screenWidth: screen ? String(screen.width) : '',
    screenHeight: screen ? String(screen.height) : '',
    millions: screen?.millions ?? '',
  };
}
