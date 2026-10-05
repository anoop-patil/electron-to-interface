import { useEffect, useRef, useState } from 'react';
import { buttonClass } from '../button';
import { explainProgram, fillString, template, type TemplateId } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import { pixelId } from '../explain/output';
import { countPixels, isBlank, pixelsFacts, type Level9, type PixelCounts } from '../explain/pixels';
import type { Analysis } from '../generated/analysis';
import { useScreen } from '../screen';
import { LinePicker, SELECTED_CLASSES } from './LinePicker';

interface LevelProps {
  analysis: Analysis;
  view: Level9;
  /** Selects a character of a line of output, px-N-C. */
  onSelect(factId: string): void;
}

/** The line is drawn as in prototype v8: 20 CSS pixels of the page's code font, in a 28-pixel line, on a baseline 21 pixels down. */
const FONT_SIZE = 20;
const LINE_HEIGHT = 28;
const BASELINE = 21;
const PAD = 2;

/** Up to this many characters have buttons at once; a longer line is shown a page of them at a time. */
const PAGE = 40;

/** How big one enlarged pixel can be, in CSS pixels, and how tall the whole grid may get. */
const SMALLEST_SQUARE = 4;
const BIGGEST_SQUARE = 18;
const TALLEST_GRID = 480;

/** What a character's button says: the character, or a word for one you can't see. */
const nameOf = (character: string) => (character === '\t' ? 'tab' : isBlank(character) ? 'space' : character);
/** The character as the journey shows it, with a symbol for one you can't see. */
const shownAs = (character: string) => (character === '\t' ? '⇥' : isBlank(character) ? '␠' : character);

type Rgb = [number, number, number];

/** The page's colors, from its design tokens, so the grid matches the theme. */
function colors() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  // A canvas reads any CSS color, #fff included, and gives an opaque one back as #rrggbb.
  const parser = document.createElement('canvas').getContext('2d')!;
  const rgb = (name: string): Rgb => {
    parser.fillStyle = token(name);
    const hex = /^#([0-9a-f]{6})$/i.exec(parser.fillStyle)?.[1] ?? '808080';
    return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)) as Rgb;
  };
  return { ink: rgb('--ink'), surface: rgb('--surface'), rule: token('--rule'), accent: token('--accent'), family: token('--mono') };
}

/** What was drawn for the selected character: its cell's size in pixels, and how they came out. */
interface Drawn {
  width: number;
  height: number;
  counts: PixelCounts;
}

interface Canvases {
  big: HTMLCanvasElement;
  actual: HTMLCanvasElement;
}

/**
 * Draws the shown characters as the browser draws text, in the screen's own pixels: the actual-size line, with the
 * selected character's cell outlined. Then draws the selected character on its own, in the same place, and reads back
 * how much ink each pixel of its cell got, so a neighbour's edge never counts as its own: the big grid shows that cell,
 * a square for each pixel, with the font's outline on top.
 */
function draw({ big, actual }: Canvases, shown: string, before: string, character: string, ratio: number, room: number): Drawn {
  const { ink, surface, rule, accent, family } = colors();
  const font = (size: number) => `400 ${size}px ${family}`;
  const pad = PAD * ratio;
  const baseline = Math.round(BASELINE * ratio);
  const text = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  text.font = font(FONT_SIZE * ratio);
  const left = pad + text.measureText(before).width;
  const right = pad + text.measureText(before + character).width;
  const width = Math.ceil(pad * 2 + text.measureText(shown).width);
  const height = Math.ceil(LINE_HEIGHT * ratio);
  text.canvas.width = width;
  text.canvas.height = height;
  // Resizing a canvas resets its font.
  text.font = font(FONT_SIZE * ratio);
  text.fillStyle = '#000';
  text.fillText(shown, pad, baseline);
  const pixels = text.getImageData(0, 0, width, height).data;

  // The actual-size line: the same pixels, in the page's ink.
  const line = actual.getContext('2d')!;
  actual.width = width;
  actual.height = height;
  actual.style.width = `${width / ratio}px`;
  actual.style.height = `${height / ratio}px`;
  const image = line.createImageData(width, height);
  for (let at = 0; at < width * height; at++) {
    image.data.set(ink, at * 4);
    image.data[at * 4 + 3] = pixels[at * 4 + 3];
  }
  line.putImageData(image, 0, 0);
  const x0 = Math.floor(left);
  const cellWidth = Math.max(1, Math.ceil(right) - x0);
  text.clearRect(0, 0, width, height);
  text.fillText(character, left, baseline);
  const own = text.getImageData(x0, 0, cellWidth, height).data;
  const inkAt = (x: number, y: number) => own[(y * cellWidth + x) * 4 + 3];
  line.strokeStyle = accent;
  line.lineWidth = ratio;
  line.strokeRect(x0 + ratio / 2, ratio / 2, cellWidth - ratio, height - ratio);

  // The big grid: one square for each pixel of the selected character's cell.
  const square = Math.max(SMALLEST_SQUARE, Math.min(BIGGEST_SQUARE, Math.floor(Math.min(room / cellWidth, TALLEST_GRID / height))));
  big.width = Math.round(cellWidth * square * ratio);
  big.height = Math.round(height * square * ratio);
  big.style.width = `${cellWidth * square}px`;
  big.style.height = `${height * square}px`;
  const grid = big.getContext('2d')!;
  grid.setTransform(ratio, 0, 0, ratio, 0, 0);
  const cell: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < cellWidth; x++) {
      const amount = inkAt(x, y);
      cell.push(amount);
      const mix = surface.map((value, at) => Math.round(value + ((ink[at] - value) * amount) / 255));
      grid.fillStyle = `rgb(${mix.join(',')})`;
      grid.fillRect(x * square, y * square, square, square);
    }
  }
  grid.strokeStyle = rule;
  grid.lineWidth = 1;
  grid.beginPath();
  for (let x = 0; x <= cellWidth; x++) {
    grid.moveTo(x * square + 0.5, 0);
    grid.lineTo(x * square + 0.5, height * square);
  }
  for (let y = 0; y <= height; y++) {
    grid.moveTo(0, y * square + 0.5);
    grid.lineTo(cellWidth * square, y * square + 0.5);
  }
  grid.stroke();
  if (!isBlank(character)) {
    grid.font = font(FONT_SIZE * ratio * square);
    grid.strokeStyle = accent;
    grid.lineWidth = 2;
    grid.strokeText(character, (left - x0) * square, baseline * square);
  }
  return { width: cellWidth, height, counts: countPixels(cell) };
}

/** A number that changes whenever the theme does, so the grid is redrawn in the new colors. */
function useThemeChanges() {
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    const changed = () => setChanges((count) => count + 1);
    const observer = new MutationObserver(changed);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const dark = matchMedia('(prefers-color-scheme: dark)');
    dark.addEventListener('change', changed);
    return () => {
      observer.disconnect();
      dark.removeEventListener('change', changed);
    };
  }, []);
  return changes;
}

/** How wide an element is, in CSS pixels, as it changes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** The selected character drawn live: enlarged into a grid of pixels, with how many are lit, then at actual size. */
function Drawing({ view, shown, before }: { view: Level9 & { character: string }; shown: string; before: string }) {
  const { ratio } = useScreen();
  const themeChanges = useThemeChanges();
  const [box, width] = useWidth();
  const big = useRef<HTMLCanvasElement>(null);
  const actual = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const { character } = view;

  useEffect(() => {
    if (width === 0) return;
    let current = true;
    const family = getComputedStyle(document.documentElement).getPropertyValue('--mono');
    // Draw once the font is ready, so the pixels are its own, not a stand-in's.
    document.fonts
      .load(`400 ${FONT_SIZE}px ${family}`, shown)
      .catch(() => [])
      .then(() => {
        // The counts beside the grid take about 220 pixels; on a narrow screen they go under it instead.
        const room = width >= 560 ? width - 220 : width;
        if (current) setDrawn(draw({ big: big.current!, actual: actual.current! }, shown, before, character, ratio, room));
      });
    return () => {
      current = false;
    };
  }, [shown, before, character, ratio, width, themeChanges]);

  const facts = pixelsFacts(null, drawn ?? undefined);
  const stat = (id: TemplateId) => <ExplanationText spans={fillString(template(id, 'pixels').text, facts)} />;
  const swatch = 'mr-1.5 inline-block size-3 border border-rule2 align-[-1px]';
  const size = drawn ? ` of ${drawn.width} by ${drawn.height}` : '';
  const label = `${nameOf(character)}, as a grid${size} pixels${isBlank(character) ? '' : ', with the font’s outline on top'}`;
  return (
    <div className="grid gap-4" ref={box}>
      <div className="flex flex-wrap items-start gap-5">
        <canvas ref={big} className="max-w-full rounded" role="img" aria-label={label} />
        {drawn && (
          <div className="grid min-w-0 flex-[1_1_200px] gap-2 font-mono text-[13px] text-ink3 [&_b]:font-semibold [&_b]:text-ink">
            <div>{stat('level9.cell')}</div>
            <div>
              <span className={`${swatch} bg-ink`} />
              {stat('level9.lit')}
            </div>
            <div>
              <span className={`${swatch} bg-[color-mix(in_srgb,var(--ink)_50%,var(--surface))]`} />
              {stat('level9.partly')}
            </div>
            <div>
              <span className={`${swatch} bg-surface`} />
              {stat('level9.dark')}
            </div>
            {!isBlank(character) && (
              <div>
                <span className="mr-1.5 inline-block w-3.5 border-t-2 border-accent align-[3px]" />
                {stat('level9.outline')}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3.5 text-[13px] text-ink3">
        <canvas ref={actual} className="max-w-full rounded-md border border-dashed border-rule2 bg-surface" role="img" aria-label={`${shown}, at actual size`} />
        <span>{stat('level9.actualSize')}</span>
      </div>
    </div>
  );
}

/**
 * Zoom level 9: one character of a line of output, drawn live by the browser and enlarged until each pixel is a
 * square, with the font's outline on top, as on a typical terminal.
 */
export function PixelsZoomLevel({ analysis, view, onSelect }: LevelProps) {
  const program = (id: TemplateId) => explainProgram(id, analysis).text;
  const { pixels } = useScreen();
  const { characters, at, character, bytes } = view;
  const start = at === null ? 0 : Math.floor(at / PAGE) * PAGE;
  const end = Math.min(characters.length, start + PAGE);
  const page = (first: number) => onSelect(pixelId(view.line, first));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px] text-ink3">
        <span>
          <ExplanationText spans={program('level9.caption')} />
        </span>
        <span>
          <ExplanationText spans={program('level9.pick')} />
        </span>
      </div>
      <LinePicker lines={view.lines} line={view.line} onPick={(line) => onSelect(pixelId(line, 0))} />
      {analysis.writesCutShort && (
        <p className="text-[13px] text-ink2">
          <ExplanationText spans={program('level8.cutShort')} />
        </p>
      )}
      {characters.length > PAGE && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink2">
          <button type="button" className={buttonClass({ size: 'sm' })} disabled={start === 0} onClick={() => page(start - PAGE)}>
            Earlier characters
          </button>
          <span className="font-mono text-[12px]">
            {start + 1} to {end} of {characters.length}
          </span>
          <button type="button" className={buttonClass({ size: 'sm' })} disabled={end === characters.length} onClick={() => page(end)}>
            Later characters
          </button>
        </div>
      )}
      {character !== null && (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Characters">
            {characters.slice(start, end).map((other, offset) => {
              const index = start + offset;
              const selected = index === at;
              return (
                <button
                  key={index}
                  type="button"
                  className={`grid h-12 min-w-11 cursor-pointer place-items-center rounded-lg border-[1.5px] px-1.5 ${isBlank(other) ? 'font-sans text-[12px] text-ink2' : 'font-mono text-[20px]'} ${selected ? SELECTED_CLASSES : 'border-rule2 bg-surface hover:bg-sunk'}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(pixelId(view.line, index))}
                >
                  {nameOf(other)}
                </button>
              );
            })}
          </div>
          <ol className="flex flex-wrap items-center gap-2 text-[13px] text-ink3" aria-label="From bytes to pixels">
            {[
              [bytes.length > 8 ? `${bytes.slice(0, 8).join(' ')} …` : bytes.join(' '), bytes.length === 1 ? 'byte' : 'bytes'],
              [shownAs(character), 'character'],
              ['✎', 'font outline'],
              ['▦', 'pixels'],
            ].map(([shown, what], step) => (
              <li key={what} className="flex items-center gap-2">
                {step > 0 && <span aria-hidden="true">→</span>}
                <span className="flex min-w-[74px] flex-col items-center gap-0.5 rounded-[10px] border-[1.5px] border-rule2 bg-surface px-3 py-2">
                  <b className="font-mono text-[18px] font-semibold text-ink">{shown}</b>
                  {what}
                </span>
              </li>
            ))}
          </ol>
          <Drawing view={{ ...view, character }} shown={characters.slice(start, end).join('')} before={characters.slice(start, at!).join('')} />
          <p className="max-w-[70ch] text-[13px] text-ink2">
            <ExplanationText spans={program('level9.drawn')} />
          </p>
        </>
      )}
      <p className="rounded-[10px] border-[1.5px] border-dotted border-rule2 px-3.5 py-3 text-[14px] text-ink2 [&_b]:text-ink">
        <ExplanationText spans={fillString(template('level9.screen', 'pixels').text, pixelsFacts(pixels))} />
        <span className="mx-1 inline-flex gap-0.5 align-[-2px]" aria-hidden="true">
          <i className="h-3.5 w-[5px] rounded-[1px] bg-[#E5484D]" />
          <i className="h-3.5 w-[5px] rounded-[1px] bg-[#30A46C]" />
          <i className="h-3.5 w-[5px] rounded-[1px] bg-[#3E63DD]" />
        </span>
      </p>
    </div>
  );
}
