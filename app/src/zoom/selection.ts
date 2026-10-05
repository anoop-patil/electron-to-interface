import { allSteps, runIndex, runsOfStep, stepById, stepOfRun, type StepInCode } from '../explain/bytecode';
import { closestLine, lineById, outputLines, STAGE_ID, stageId } from '../explain/output';
import { nodeById } from '../explain/syntaxTree';
import type { Analysis, ByteSpan } from '../generated/analysis';
import type { CharSpan } from './characters';

/**
 * Where a Selection sits: the bytes of the Program it comes from, if it comes from one place, and for a step or a step
 * run, which one. Levels 6 and 7 show the step run; levels 8 and 9 follow the line of output it printed (ADR 0007).
 */
export interface Anchor {
  span: ByteSpan | null;
  step?: StepInCode;
  /** The step run, as a place in the Analysis's runs. */
  run?: number;
}

/** Each kind of Fact, by its Fact ID's prefix, and where one sits. A zoom level with Facts of its own adds them here. */
const FACTS: Record<string, (analysis: Analysis, id: string) => Anchor | null> = {
  // byte-N and tok-N are the Nth byte and token.
  byte: (analysis, id) => {
    const at = Number(id.slice('byte-'.length));
    return analysis.bytes[at] ? { span: { start: at, end: at + 1 } } : null;
  },
  tok: (analysis, id) => {
    const token = analysis.tokens[Number(id.slice('tok-'.length))];
    return token ? { span: token.span } : null;
  },
  ast: (analysis, id) => {
    const node = nodeById(analysis, id);
    return node ? { span: node.span } : null;
  },
  bc: (analysis, id) => {
    const step = stepById(analysis, id);
    return step ? { span: step.step.span, step } : null;
  },
  run: (analysis, id) => runAnchor(analysis, runIndex(id)),
  // out-N is the Nth line of output, and out-N-S that line at stage S of level 8. A line sits where the step run that
  // wrote its last piece does; a line of Python's own report, where the last step run, which raised the error, does.
  out: (analysis, id) => {
    const line = lineById(analysis, id);
    if (!line) return null;
    const run = line.run ?? (line.report && !analysis.runsCutShort ? analysis.runs.length - 1 : -1);
    return runAnchor(analysis, run) ?? { span: null };
  },
};

function runAnchor(analysis: Analysis, run: number): Anchor | null {
  if (!analysis.runs[run]) return null;
  const step = stepOfRun(analysis, analysis.runs[run]);
  return { span: step.step.span, step, run };
}

/**
 * Where the Fact with this ID sits, or null if the Analysis has no such Fact. A Fact with no bytes, such as the token
 * that ends a block, has no place in the code.
 */
export function anchorOf(analysis: Analysis, id: string): Anchor | null {
  const anchor = FACTS[id.slice(0, id.indexOf('-'))]?.(analysis, id);
  if (!anchor) return null;
  return anchor.span && anchor.span.end <= anchor.span.start ? { ...anchor, span: null } : anchor;
}

/**
 * How a zoom level's elements link to the other levels' Facts: which Fact IDs are its own, its element closest to
 * where another Selection sits, and what it selects when nothing matches. A level that `always` has a Selection
 * selects its fallback before the learner picks; levels 2 to 4 select nothing until then.
 */
interface LevelLinks {
  owns: RegExp;
  closest(analysis: Analysis, anchor: Anchor): string | null;
  fallback(analysis: Analysis): string | null;
  always?: true;
}

const length = (span: ByteSpan) => span.end - span.start;
const contains = (outer: ByteSpan, inner: ByteSpan) => outer.start <= inner.start && inner.end <= outer.end;
const same = (one: ByteSpan, other: ByteSpan) => one.start === other.start && one.end === other.end;

/**
 * The step closest to some code: the first step from exactly that code, else the first from inside it, else the
 * smallest around it. RESUME, which every code object starts with, comes from no code of its own.
 */
function stepFor(analysis: Analysis, span: ByteSpan) {
  let exact: StepInCode | undefined;
  let inside: StepInCode | undefined;
  let around: StepInCode | undefined;
  for (const found of allSteps(analysis)) {
    const { step } = found;
    if (!step.span || step.opname === 'RESUME') continue;
    if (!exact && same(span, step.span)) exact = found;
    if (!inside && contains(span, step.span)) inside = found;
    if (contains(step.span, span) && (!around || length(step.span) < length(around.step.span!))) around = found;
  }
  return exact ?? inside ?? around;
}

/** A step, selected through its first run, or as itself if it never ran. */
function selectStep(analysis: Analysis, step: StepInCode) {
  const [first] = runsOfStep(analysis, step.step);
  return first === undefined ? step.step.id : analysis.runs[first].id;
}

/** A step run, or a step that never ran: the closest to the Selection, else the first step run. */
const STEP_RUN: LevelLinks = {
  owns: /^run-/,
  closest: (analysis, { span, step, run }) => {
    if (run !== undefined) return analysis.runs[run].id;
    const found = step ?? (span && stepFor(analysis, span));
    return found ? selectStep(analysis, found) : null;
  },
  fallback: (analysis) => analysis.runs[0]?.id ?? allSteps(analysis)[0]?.step.id ?? null,
  always: true,
};

/**
 * Each zoom level's links. A level with no entry, level 1, keeps the Selection as it is. Levels 6 and 7's elements are
 * step runs, as level 5's are: they show the C, and the machine code, that ran for one. Level 8 follows the line of
 * output the step run printed (ADR 0007). Level 9 shows a step run until its ticket gives it elements of its own.
 */
const LINKS: Record<number, LevelLinks> = {
  2: {
    owns: /^byte-/,
    closest: (analysis, { span }) => (span && analysis.bytes[span.start]?.id) || null,
    fallback: (analysis) => analysis.bytes[0]?.id ?? null,
  },
  // The token it starts in, or the next one: the spaces between tokens belong to none.
  3: {
    owns: /^tok-/,
    closest: (analysis, { span }) => (span && analysis.tokens.find((token) => length(token.span) > 0 && token.span.end > span.start)?.id) || null,
    fallback: (analysis) => analysis.tokens.find((token) => length(token.span) > 0)?.id ?? null,
  },
  // The smallest box around it. Of two boxes with the same code, the one inside the other comes later. Code that no
  // box holds, such as a newline, is in the Module, which has no place of its own.
  4: {
    owns: /^ast-/,
    closest: (analysis, { span }) => {
      let best = null;
      if (span) for (const node of analysis.ast) if (node.span && contains(node.span, span) && (!best || length(node.span) <= length(best.span!))) best = node;
      return best?.id ?? null;
    },
    fallback: (analysis) => analysis.ast[0]?.id ?? null,
  },
  5: STEP_RUN,
  6: STEP_RUN,
  7: STEP_RUN,
  // A line of output at one stage: the line the closest step run printed, else the next one printed after it, at its
  // first stage. A Program that printed nothing has nothing to select.
  8: {
    owns: STAGE_ID,
    closest: (analysis, anchor) => {
      const run = STEP_RUN.closest(analysis, anchor);
      const line = run?.startsWith('run-') ? closestLine(analysis, runIndex(run)) : null;
      return line && stageId(line, 1);
    },
    fallback: (analysis) => {
      const [first] = outputLines(analysis);
      return first ? stageId(first, 1) : null;
    },
    always: true,
  },
  9: STEP_RUN,
};

/**
 * What a zoom level shows selected, for the learner's Selection: the Selection itself if it is one of the level's own
 * elements, else the element closest to it, else the level's fallback.
 */
export function selectionAt(analysis: Analysis, selection: string | null, level: number): string | null {
  const links = LINKS[level];
  if (!links || (selection !== null && links.owns.test(selection))) return selection;
  if (selection === null) return links.always ? links.fallback(analysis) : null;
  const anchor = anchorOf(analysis, selection);
  return (anchor && links.closest(analysis, anchor)) || links.fallback(analysis);
}

/** The characters of the Program a Selection comes from, as the editor counts them. Null if it has no place in the code. */
export function charsOf(analysis: Analysis, id: string): CharSpan | null {
  const span = anchorOf(analysis, id)?.span;
  if (!span) return null;
  return { start: analysis.bytes[span.start].charIndex, end: analysis.bytes[span.end - 1].charIndex + 1 };
}
