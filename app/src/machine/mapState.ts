import { framesAfter } from '../explain/bytecode';
import { explainProgram, fillString, template, type Span, type TemplateId } from '../explain/explain';
import { level6 } from '../explain/interpreter';
import { level7, level7IsReference } from '../explain/machine';
import { level8, outputFacts } from '../explain/operatingSystem';
import { pixelsFacts, type ScreenPixels } from '../explain/pixels';
import { explainForStep, stepSelectionAt } from '../explain/steps';
import type { Analysis } from '../generated/analysis';
import type { PartId } from './parts';

/** What the learner is viewing: the zoom level, the Analysis once they've clicked Run, and the Fact ID of what the level shows selected (`selectionAt`). */
export interface MapView {
  level: number;
  analysis: Analysis | null;
  selection: string | null;
  /** The learner's screen, as the browser reports it, where it can. */
  screen?: ScreenPixels | null;
}

/** The lit parts, each with a short note about what is there right now. */
export interface MapState {
  lit: { part: PartId; note?: Span[] }[];
}

/**
 * What each built zoom level lights. A zoom level's ticket adds its own entry here; the map itself doesn't change.
 * The app keeps the Program in the browser's memory and never saves it as a file, so levels 1 to 4 light RAM, not the disk.
 */
const LEVELS: Record<number, (analysis: Analysis, selection: string | null, screen: ScreenPixels | null) => MapState> = {
  1: (analysis) => ({ lit: [{ part: 'ram', note: explainProgram('map.level1.ram', analysis).text }] }),
  2: (analysis) => ({ lit: [{ part: 'ram', note: explainProgram('map.level2.ram', analysis).text }] }),
  3: (analysis) => ({ lit: [{ part: 'ram', note: explainProgram('map.level3.ram', analysis).text }] }),
  4: (analysis) => ({ lit: [{ part: 'ram', note: explainProgram('map.level4.ram', analysis).text }] }),
  // Level 5 lights the steps, the objects and the plates, each with how much it holds after the selected step run.
  5: (analysis, selection) => {
    const selected = stepSelectionAt(analysis, selection, 5);
    if (!selected) return { lit: [{ part: 'ram' }] };
    const note = (id: TemplateId) => explainForStep(id, analysis, selected.step, selected.run).text;
    const frames = selected.run === null ? 0 : framesAfter(analysis, selected.run).length;
    return {
      lit: [
        { part: 'ram' },
        { part: 'code', note: note(selected.run === null ? 'map.level5.codeNeverRan' : 'map.level5.code') },
        ...(selected.run === null ? [] : [
          { part: 'stack' as const, note: note(frames === 1 ? 'map.level5.stackOneFrame' : 'map.level5.stack') },
          { part: 'heap' as const, note: note('map.level5.heap') },
        ]),
      ],
    };
  },
  // Level 6 lights Python itself, which runs the C for the selected step run, beside your steps, in RAM, and the CPU running it.
  6: (analysis, selection) => {
    const view = level6(analysis, selection);
    if (!view) return { lit: [{ part: 'ram' }, { part: 'py' }, { part: 'cpu' }] };
    const { selected, handlers } = view;
    const id: TemplateId = selected.run === null ? 'map.level6.pyNeverRan' : handlers.length > 0 ? 'map.level6.py' : 'map.level6.pyTypical';
    return {
      lit: [{ part: 'ram' }, { part: 'py', note: explainForStep(id, analysis, selected.step, selected.run).text }, { part: 'code' }, { part: 'cpu' }],
    };
  },
  // Level 7 lights the CPU running the selected step run's machine code, with its registers and cache, beside Python itself in RAM.
  7: (analysis, selection) => {
    const view = level7(analysis, selection);
    const machine = [
      { part: 'reg' as const, note: explainProgram('map.level7.reg', analysis).text },
      { part: 'cache' as const, note: explainProgram('map.level7.cache', analysis).text },
      { part: 'ram' as const },
      { part: 'py' as const },
    ];
    if (!view) return { lit: [{ part: 'cpu' }, ...machine] };
    const { selected } = view;
    let id: TemplateId = 'map.level7.cpuTypical';
    if (selected.run === null) id = 'map.level7.cpuNeverRan';
    else if (level7IsReference(view)) id = 'map.level7.cpu';
    return { lit: [{ part: 'cpu', note: explainForStep(id, analysis, selected.step, selected.run).text }, ...machine] };
  },
  // Level 8 lights the operating system, and RAM while the line's bytes are still in the Program's zone, in Python's buffer.
  8: (analysis, selection) => {
    const view = level8(analysis, selection);
    if (!view) return { lit: [{ part: 'os', note: explainProgram(analysis.writesCutShort ? 'map.level8.osCutShort' : 'map.level8.osNothing', analysis).text }] };
    const note = (id: TemplateId) => fillString(template(id, 'output').text, outputFacts(analysis, view.line));
    if (view.zone === 0) return { lit: [{ part: 'os', note: note('map.level8.osWaiting') }, { part: 'ram', note: note('map.level8.ram') }] };
    return { lit: [{ part: 'os', note: note('map.level8.os') }] };
  },
  // Level 9 lights the screen, with how many pixels it has.
  9: (_analysis, _selection, screen) => ({
    lit: [{ part: 'screen', note: screen ? fillString(template('map.level9.screen', 'pixels').text, pixelsFacts(screen)) : undefined }],
  }),
};

/** Where the thing being viewed lives right now. Nothing is lit before the first Run. */
export function mapState({ level, analysis, selection, screen = null }: MapView): MapState {
  const lightsFor = LEVELS[level];
  return analysis && lightsFor ? lightsFor(analysis, selection, screen) : { lit: [] };
}
