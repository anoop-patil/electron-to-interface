import { explainProgram, type Span } from '../explain/explain';
import type { Analysis } from '../generated/analysis';
import type { PartId } from './parts';

/** What the learner is viewing: the zoom level, the Analysis once they've clicked Run, and the Fact ID of their Selection. */
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
 * The app keeps the Program in the browser's memory and never saves it as a file, so levels 1 to 3 light RAM, not the disk.
 */
const LEVELS: Record<number, (analysis: Analysis, selection: string | null) => MapState> = {
  1: (analysis) => ({ lit: [{ part: 'ram', note: explainProgram('map.level1.ram', analysis).text }] }),
  2: (analysis) => ({ lit: [{ part: 'ram', note: explainProgram('map.level2.ram', analysis).text }] }),
  3: (analysis) => ({ lit: [{ part: 'ram', note: explainProgram('map.level3.ram', analysis).text }] }),
};

/** Where the thing being viewed lives right now. Nothing is lit before the first Run, or at a level that isn't built yet. */
export function mapState({ level, analysis, selection }: MapView): MapState {
  const lightsFor = LEVELS[level];
  return analysis && lightsFor ? lightsFor(analysis, selection) : { lit: [] };
}
