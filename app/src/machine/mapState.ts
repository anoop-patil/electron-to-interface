import { framesAfter } from '../explain/bytecode';
import { explainProgram, type Span, type TemplateId } from '../explain/explain';
import { explainForStep, level5Selection } from '../explain/steps';
import type { Analysis } from '../generated/analysis';
import type { PartId } from './parts';

/** What the learner is viewing: the zoom level, the Analysis once they've clicked Run, and the Fact ID of what the level shows selected (`selectionAt`). */
export interface MapView {
  level: number;
  analysis: Analysis | null;
  selection: string | null;
}

/** The lit parts, each with a short note about what is there right now. */
export interface MapState {
  lit: { part: PartId; note?: Span[] }[];
}

/**
 * What each built zoom level lights. A zoom level's ticket adds its own entry here; the map itself doesn't change.
 * The app keeps the Program in the browser's memory and never saves it as a file, so levels 1 to 4 light RAM, not the disk.
 */
const LEVELS: Record<number, (analysis: Analysis, selection: string | null) => MapState> = {
  1: (analysis) => ({ lit: [{ part: 'ram', note: explainProgram('map.level1.ram', analysis).text }] }),
  2: (analysis) => ({ lit: [{ part: 'ram', note: explainProgram('map.level2.ram', analysis).text }] }),
  3: (analysis) => ({ lit: [{ part: 'ram', note: explainProgram('map.level3.ram', analysis).text }] }),
  4: (analysis) => ({ lit: [{ part: 'ram', note: explainProgram('map.level4.ram', analysis).text }] }),
  // Level 5 lights the steps, the objects and the plates, each with how much it holds after the selected step run.
  5: (analysis, selection) => {
    const selected = level5Selection(analysis, selection);
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
};

/** Where the thing being viewed lives right now. Nothing is lit before the first Run, or at a level that isn't built yet. */
export function mapState({ level, analysis, selection }: MapView): MapState {
  const lightsFor = LEVELS[level];
  return analysis && lightsFor ? lightsFor(analysis, selection) : { lit: [] };
}
