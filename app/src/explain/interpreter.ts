import type { Analysis } from '../generated/analysis';
import { fillString, type Explanation, type Span } from './explain';
import { LIBRARY, exampleOf, handlerOf, handlersRun } from './reference';
import { explainForStep, stepFacts, stepSelectionAt, type StepSelection } from './steps';

/** One handler that ran for the selected step run: its key lines of C, each with its sentence, and where they are. */
export interface HandlerShown {
  handler: string;
  /** Its Reference Library entry: CALL/rewrites. */
  entry: string;
  /** The handler its code ran inside, if no handler of its own ran. */
  inside?: string;
  note: Span[];
  lines: { say: Span[]; code: string; first: number; last: number }[];
  /** The quoted lines on GitHub, at the pinned tag: one link for each stretch of them, such as lines 1741–1744. */
  links: { where: string; href: string }[];
}

/** Zoom level 6's Selection, the Example the Program is, if it is one, and the handlers that ran, in order. */
export interface Level6 {
  selected: StepSelection;
  example: string | null;
  /** Empty if the Reference Library has no C for this step run. */
  handlers: HandlerShown[];
}

const { repository, tag, file } = LIBRARY.source;

/** Lines of the C source, in words: line 405, or lines 1741–1744. */
export const linesInWords = (first: number, last: number) => (first === last ? `line ${first}` : `lines ${first}–${last}`);

/** The link to lines of the C source on GitHub, at the pinned tag. */
export const linkToLines = (first: number, last: number) => `${repository}/blob/${tag}/${file}#L${first}${last === first ? '' : `-L${last}`}`;

/** Quoted lines this close together share a link: what lies between them belongs to the same part of the handler. */
const NEARBY = 10;

/** The stretches of the source that quoted lines come from, in source order, each with its link. */
function linksTo(lines: { first: number; last: number }[]) {
  const stretches: { first: number; last: number }[] = [];
  for (const { first, last } of [...lines].sort((one, other) => one.first - other.first)) {
    const previous = stretches.at(-1);
    if (previous && first - previous.last <= NEARBY) previous.last = Math.max(previous.last, last);
    else stretches.push({ first, last });
  }
  return stretches.map(({ first, last }) => ({ where: linesInWords(first, last), href: linkToLines(first, last) }));
}

/**
 * What zoom level 6 shows for the learner's Selection: the step run closest to it (`selectionAt`), and the C of each
 * handler that ran for it, its sentences filled in with the step run's Facts. Null if the Program has no steps.
 */
export function level6(analysis: Analysis, selection: string | null): Level6 | null {
  const selected = stepSelectionAt(analysis, selection, 6);
  if (!selected) return null;
  const facts = stepFacts(analysis, selected.step, selected.run);
  const handlers = handlersRun(analysis, selected.step.step, selected.run).map(({ entry, inside }) => {
    const { note, lines } = LIBRARY.entries[entry];
    return {
      handler: handlerOf(entry),
      entry,
      ...(inside && { inside }),
      note: fillString(note, facts),
      lines: lines.map((line) => ({ ...line, say: fillString(line.say, facts) })),
      links: linksTo(lines),
    };
  });
  return { selected, example: exampleOf(analysis)?.name ?? null, handlers };
}

/**
 * The Explanation of what level 6 shows: how the interpreter does the step, and that a run which rewrote its step ran
 * twice over. With no C to show, how it usually works.
 */
export function explainLevel6(analysis: Analysis, { selected, handlers }: Level6): Explanation {
  const { step, run } = selected;
  if (handlers.length === 0) return explainForStep('level6.stepTypical', analysis, step, run);
  const explanation = explainForStep('level6.step', analysis, step, run);
  return { ...explanation, ...(handlers.length > 1 && { more: explainForStep('level6.twice', analysis, step, run).text }) };
}

/** With no C to show, the form Python rewrote the step into when the Program ran unwatched, if it did: Observed, unlike the rest. */
export function level6AfterRun(analysis: Analysis, { selected, handlers }: Level6): Span[] | null {
  const { afterRun, opname } = selected.step.step;
  if (handlers.length > 0 || !afterRun || afterRun === opname) return null;
  return explainForStep('level6.afterRun', analysis, selected.step, selected.run).text;
}
