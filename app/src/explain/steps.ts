import type { Analysis, StepSlot } from '../generated/analysis';
import { selectionAt } from '../zoom/selection';
import { codeName, framesAfter, objectsIn, runIndex, runsOfStep, stepById, stepOfRun, type FrameAfter, type StepInCode } from './bytecode';
import { counted, fill, fillString, hasTemplate, template, type Explanation, type Span, type TemplateId } from './explain';
import { exampleOf, handlerOf, handlersRun } from './reference';

/** The Selection at levels 5 to 7: a step, and the run of it that is selected, as a place in the Analysis's runs, or null for a step that never ran. */
export interface StepSelection {
  step: StepInCode;
  run: number | null;
}

/**
 * The Selection at a level that shows step runs, from the learner's Selection: a step run, a step selected through its
 * first run if it ran, or the step run closest to a Selection from another level (`selectionAt`, which gives a step's
 * own Fact ID only for a step that never ran). Null if the Program has no steps.
 */
export function stepSelectionAt(analysis: Analysis, selection: string | null, level: 5 | 6 | 7): StepSelection | null {
  const id = selectionAt(analysis, selection, level);
  if (id === null) return null;
  if (!id.startsWith('run-')) return { step: stepById(analysis, id)!, run: null };
  const run = runIndex(id);
  return { step: stepOfRun(analysis, analysis.runs[run]), run };
}

/** The steps that handle two variables at once, whose argrepr names both: b, a. */
const PAIRS = new Set(['LOAD_FAST_LOAD_FAST', 'LOAD_FAST_BORROW_LOAD_FAST_BORROW', 'STORE_FAST_STORE_FAST', 'STORE_FAST_LOAD_FAST']);
const STORES = new Set(['STORE_NAME', 'STORE_FAST', 'STORE_GLOBAL', 'STORE_DEREF']);
const CODE_OBJECT = /^<code object (.+)>$/;

/** The name a step looks up or stores, from what dis says its argument means: print + NULL is print. */
function nameOf({ step }: StepInCode) {
  const code = CODE_OBJECT.exec(step.argrepr);
  if (code) return code[1];
  if (PAIRS.has(step.opname)) return step.argrepr.replace(', ', ' and ');
  return step.argrepr.replace(/^NULL\|self \+ /, '').replace(/ \+ NULL(\|self)?$/, '');
}

/** The code of what a call calls, if its code is a plain name followed by brackets: print, or name.upper. */
function calleeOf(analysis: Analysis, { step }: StepInCode) {
  if (!step.span) return '';
  const bytes = analysis.bytes.slice(step.span.start, step.span.end).map((byte) => byte.value);
  const code = new TextDecoder().decode(Uint8Array.from(bytes));
  return /^([A-Za-z_][\w.]*)\(/.exec(code)?.[1] ?? '';
}

/** How many things a step takes, in words, for the steps that say so. */
function countOf({ step }: StepInCode) {
  const arg = step.arg ?? 0;
  if (step.opname.startsWith('CALL')) return arg === 0 ? 'nothing' : counted(arg, 'thing', 'things');
  if (step.opname === 'BUILD_STRING') return counted(arg, 'piece', 'pieces');
  if (/^(BUILD_(LIST|TUPLE|SET)|UNPACK_SEQUENCE)$/.test(step.opname)) return counted(arg, 'item', 'items');
  return '';
}

/** The number in its code object of the step with this offset. */
const numberAt = (analysis: Analysis, code: number, offset: number | null) =>
  offset === null ? '' : String(analysis.bytecode[code].steps.findIndex((step) => step.offset === offset) + 1);

/** The runs of the selected run's frame, after it: the step it ran next is the first. */
const nextInFrame = (analysis: Analysis, at: number) => analysis.runs.slice(at + 1).find((run) => run.frame === analysis.runs[at].frame);

/** For a run of FOR_ITER, which trip round the loop: how many times it has run since the walker under it was made. */
function tripOf(analysis: Analysis, at: number) {
  const before = framesAfter(analysis, at - 1).at(-1);
  const walker = before?.plates.at(-1);
  if (!walker) return '';
  const { frame, code, offset } = analysis.runs[at];
  return String(analysis.runs.slice(walker.madeBy + 1, at + 1).filter((run) => run.frame === frame && run.code === code && run.offset === offset).length);
}

/** The frame a step run ran in, after it. */
const frameOf = (frames: FrameAfter[], frame: number | undefined) => frames.find((other) => other.frame === frame);

/** What the selected run put on its top plate, or stored, if the replay knows the object. */
function objectOf(analysis: Analysis, found: StepInCode, at: number, frames: FrameAfter[]) {
  const frame = frameOf(frames, analysis.runs[at].frame);
  if (!frame) return '';
  if (STORES.has(found.step.opname)) return frame.variables.find(({ name }) => name === nameOf(found))?.value.object?.repr ?? '';
  const top = frame.plates.at(-1);
  return top?.madeBy === at && top.object ? top.object.repr : '';
}

/** How much the plates and variables of all frames hold after a step run: plates, frames and the objects they point to. */
function holdings(frames: FrameAfter[]) {
  const objects = objectsIn(frames);
  return {
    plates: counted(frames.reduce((count, { plates }) => count + plates.length, 0), 'plate', 'plates'),
    frames: counted(frames.length, 'frame', 'frames'),
    objects: counted(objects.size, 'object', 'objects'),
  };
}

const runsInWords = (runs: number) => (runs === 0 ? 'never ran' : runs === 1 ? 'ran once' : `ran ${runs} times`);

export function stepFacts(analysis: Analysis, found: StepInCode, at: number | null): Record<StepSlot, string> {
  const { step } = found;
  const runs = runsOfStep(analysis, step);
  const frames = at === null ? [] : framesAfter(analysis, at);
  const next = at === null ? undefined : nextInFrame(analysis, at);
  return {
    opname: step.opname,
    argument: step.arg === null ? '' : step.argrepr ? ` ${step.arg} (${step.argrepr})` : ` ${step.arg}`,
    number: String(found.number),
    code: codeName(analysis.bytecode[found.code]),
    name: nameOf(found),
    value: step.opname === 'LOAD_SMALL_INT' ? String(step.arg) : step.argrepr,
    callee: calleeOf(analysis, found),
    count: countOf(found),
    operator: step.argrepr.replace(/^bool\((.*)\)$/, '$1'),
    target: numberAt(analysis, found.code, step.jump),
    afterRun: step.afterRun ?? '',
    runs: runsInWords(runs.length),
    times: String(runs.length),
    run: at === null ? '' : String(runs.indexOf(at) + 1),
    overall: at === null ? '' : String(at + 1),
    total: String(analysis.runs.length),
    object: at === null ? '' : objectOf(analysis, found, at, frames),
    printed: at === null ? '' : (analysis.runs[at].printed ?? '').replace(/\n$/, ''),
    trip: at !== null && step.opname === 'FOR_ITER' ? tripOf(analysis, at) : '',
    next: next ? numberAt(analysis, next.code, next.offset) : '',
    ...holdings(frames),
    ...handlerFacts(analysis, found, at),
  };
}

/**
 * The handlers that ran for a step run, if the Reference Library recorded them: the general form and the new one, if it
 * rewrote itself, and how many machine instructions each ran.
 */
function handlerFacts(analysis: Analysis, found: StepInCode, at: number | null) {
  const handlers = handlersRun(analysis, found.step, at);
  const names = handlers.map(({ entry }) => handlerOf(entry));
  // 33 instructions of CALL, then 107 of CALL_PY_EXACT_ARGS.
  const ran = handlers
    .filter(({ path }) => path)
    .map(({ entry, path }, index) => {
      const count = path!.length.toLocaleString('en-US');
      return index === 0 ? `${count} ${path!.length === 1 ? 'instruction' : 'instructions'} of ${handlerOf(entry)}` : `${count} of ${handlerOf(entry)}`;
    });
  return {
    handlers: names.join(', then '),
    general: names.length > 1 ? names[0] : '',
    faster: names.length > 1 ? names[1] : '',
    inside: handlers[0]?.inside ?? '',
    example: exampleOf(analysis)?.name ?? '',
    instructionsRan: ran.join(', then '),
  };
}

/** An opname as the end of its Template's ID: LOAD_NAME's Template is step.loadName. */
const camel = (opname: string) => opname.toLowerCase().replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** Whether a run of FOR_ITER found no items left, and so put nothing on the plates. */
function loopEnded(analysis: Analysis, found: StepInCode, at: number) {
  const next = nextInFrame(analysis, at);
  return next !== undefined && numberAt(analysis, next.code, next.offset) !== String(found.number + 1);
}

/** Which kind of step this is, which picks its Template; a run of it can pick a Template of its own. */
function stepKind(analysis: Analysis, found: StepInCode, at: number | null = null): TemplateId {
  const { step } = found;
  if (step.opname === 'LOAD_CONST' && CODE_OBJECT.test(step.argrepr)) return 'step.loadConstCode';
  if (step.opname === 'LOAD_GLOBAL' && (step.arg ?? 0) & 1) return 'step.loadGlobalNull';
  if (step.opname === 'LOAD_ATTR' && (step.arg ?? 0) & 1) return 'step.loadAttrMethod';
  if (step.opname === 'CALL' && calleeOf(analysis, found)) return 'step.callNamed';
  if (step.opname === 'BINARY_OP' && step.argrepr === '[]') return 'step.binaryOpSubscript';
  if (step.opname === 'RETURN_VALUE' && found.code === 0) return 'step.returnValueProgram';
  if (step.opname === 'FOR_ITER' && at !== null) return loopEnded(analysis, found, at) ? 'step.forIterDone' : 'step.forIterTrip';
  const id = `step.${camel(step.opname)}`;
  return hasTemplate(id) ? id : 'step.other';
}

/** A step's plain name, from its Template: Find greet. */
export const stepTitle = (analysis: Analysis, found: StepInCode): Span[] => fill(template(stepKind(analysis, found), 'step'), stepFacts(analysis, found, null)).title!;

/** Whether the step run started a frame of the Program's own code, under the frame it ran in. */
function startedFrame(analysis: Analysis, at: number) {
  const next = analysis.runs[at + 1];
  return next !== undefined && next.caller === analysis.runs[at].frame && analysis.runs.findIndex((run) => run.frame === next.frame) === at + 1;
}

/** What a step run did that its step's Explanation can't say: what it put or stored, what it printed, the frame it started. */
function whatItDid(analysis: Analysis, found: StepInCode, at: number, facts: Record<StepSlot, string>): Span[] {
  const notes: TemplateId[] = [];
  if (facts.object) notes.push(STORES.has(found.step.opname) ? 'step.stored' : 'step.put');
  if (facts.printed) notes.push(/^[^\n]*\n$/.test(analysis.runs[at].printed ?? '') ? 'step.printed' : 'step.printedText');
  if (found.step.opname.startsWith('CALL') && startedFrame(analysis, at)) notes.push('step.startsFrame');
  const named = { ...facts, callee: facts.callee || 'The call' };
  return notes.flatMap((id, index) => [...(index ? [{ text: ' ' }] : []), ...fillString(template(id, 'step').text, named)]);
}

/**
 * The Explanation of a step and, if one is selected, a run of it: its plain name, its opname and place in small print,
 * what it does, then what that run did. A step that never ran says so.
 */
export function explainStep(analysis: Analysis, found: StepInCode, at: number | null): Explanation {
  const facts = stepFacts(analysis, found, at);
  const term: TemplateId = at !== null ? 'step.termRun' : runsOfStep(analysis, found.step).length === 0 ? 'step.termNeverRan' : 'step.term';
  const more = at === null ? fillString(template('step.neverRan', 'step').text, facts) : whatItDid(analysis, found, at, facts);
  return {
    title: stepTitle(analysis, found),
    term: fillString(template(term, 'step').text, facts),
    text: fill(template(stepKind(analysis, found, at), 'step'), facts).text,
    ...(more.length > 0 && { more }),
  };
}

/** The form a step had become after the Program ran again, unwatched, if Python rewrote it. */
export function explainAfterRun(analysis: Analysis, found: StepInCode): Span[] | null {
  const { afterRun, opname } = found.step;
  return afterRun && afterRun !== opname ? fillString(template('step.afterRun', 'step').text, stepFacts(analysis, found, null)) : null;
}

/** One of level 5's own Templates, such as a panel's heading, filled in with the Facts of a step and, if one is selected, a run of it. */
export const explainForStep = (id: TemplateId, analysis: Analysis, found: StepInCode, at: number | null) => fill(template(id, 'step'), stepFacts(analysis, found, at));
