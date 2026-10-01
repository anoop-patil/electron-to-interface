import type { Analysis, CodeObject, Label, ObjectFact, Step, StepRun } from '../generated/analysis';

/** A step, with the code object it belongs to and its place in that code object, counting from 1. */
export interface StepInCode {
  step: Step;
  code: number;
  number: number;
}

/** What the page looks up again and again: each step by its Fact ID and by where it is, and each step's runs. */
interface BytecodeIndex {
  steps: StepInCode[];
  byId: Map<string, StepInCode>;
  byPlace: Map<string, StepInCode>;
  runsOf: Map<string, number[]>;
}

const indexes = new WeakMap<Analysis, BytecodeIndex>();

function indexOf(analysis: Analysis): BytecodeIndex {
  let index = indexes.get(analysis);
  if (!index) {
    const steps = analysis.bytecode.flatMap((code, at) => code.steps.map((step, number) => ({ step, code: at, number: number + 1 })));
    const byPlace = new Map(steps.map((found) => [`${found.code}:${found.step.offset}`, found]));
    const runsOf = new Map<string, number[]>(steps.map(({ step }) => [step.id, []]));
    analysis.runs.forEach((run, at) => runsOf.get(byPlace.get(`${run.code}:${run.offset}`)!.step.id)!.push(at));
    index = { steps, byId: new Map(steps.map((found) => [found.step.id, found])), byPlace, runsOf };
    indexes.set(analysis, index);
  }
  return index;
}

/** Every step of every code object, in order. */
export const allSteps = (analysis: Analysis) => indexOf(analysis).steps;

/** The step with this Fact ID, such as bc-3. */
export const stepById = (analysis: Analysis, id: string) => indexOf(analysis).byId.get(id) ?? null;

/** The step a step run ran. */
export const stepOfRun = (analysis: Analysis, run: StepRun) => indexOf(analysis).byPlace.get(`${run.code}:${run.offset}`)!;

/** The step runs of a step, as places in the Analysis's runs, in the order they ran. A step that never ran has none. */
export const runsOfStep = (analysis: Analysis, step: Step) => indexOf(analysis).runsOf.get(step.id) ?? [];

/** The place of a step run in the Analysis's runs, from its Fact ID, run-N. */
export const runIndex = (id: string) => Number(id.slice('run-'.length));

/** A label as the page shows it: the object it points to, as it was then, if the replay could tell which. */
export interface ShownLabel {
  /** The step run that made it, as a place in the Analysis's runs. */
  madeBy: number;
  object?: ObjectFact;
  empty?: boolean;
}

/** One frame after a step run: its code object, its plates from the bottom up, and its variables. */
export interface FrameAfter {
  frame: number;
  code: number;
  plates: ShownLabel[];
  variables: { name: string; value: ShownLabel }[];
}

/**
 * The frames after a step run, the file's first: the frames standing when the next step runs, which are that step's
 * frame and the frames waiting under it, each with its plates and variables as the replay worked them out. After the
 * last step run the Program has finished and no frames are left, unless the record was cut short.
 */
export function framesAfter(analysis: Analysis, at: number): FrameAfter[] {
  const { runs } = analysis;
  const objects = new Map(analysis.objects.map((object) => [object.id, object]));
  const plates = new Map<number, Label[]>();
  const variables = new Map<number, Map<string, Label>>();
  for (const run of runs.slice(0, at + 1)) {
    for (const seen of run.objects ?? []) objects.set(seen.object, { ...objects.get(seen.object)!, repr: seen.repr });
    for (const { frame, took, put } of run.plates ?? []) {
      const stack = plates.get(frame) ?? [];
      stack.splice(Math.max(0, stack.length - took), took, ...put);
      plates.set(frame, stack);
    }
    for (const change of run.variables ?? []) {
      const names = variables.get(change.frame) ?? new Map<string, Label>();
      if ('deleted' in change) names.delete(change.name);
      else names.set(change.name, change.value);
      variables.set(change.frame, names);
    }
  }
  const next = runs[at + 1] ?? (analysis.runsCutShort ? runs[at] : undefined);
  if (!next) return [];

  const shown = (label: Label): ShownLabel => ({
    madeBy: runIndex(label.madeBy),
    ...(label.empty && { empty: true }),
    ...(label.object && { object: objects.get(label.object) }),
  });
  // Each frame's caller, as of its latest step run up to the next one.
  const callers = new Map<number, number | null>();
  for (const run of runs.slice(0, runs.indexOf(next) + 1)) callers.set(run.frame!, run.caller ?? null);
  const chain: number[] = [];
  for (let frame: number | null | undefined = next.frame; frame !== null && frame !== undefined; frame = callers.get(frame)) chain.unshift(frame);
  return chain.map((frame) => ({
    frame,
    code: analysis.frames[frame].code,
    plates: (plates.get(frame) ?? []).map(shown),
    variables: [...(variables.get(frame) ?? new Map<string, Label>())].map(([name, value]) => ({ name, value: shown(value) })),
  }));
}

/** The objects the plates and variables of the frames point to. */
export const objectsIn = (frames: FrameAfter[]) =>
  new Map(
    frames
      .flatMap(({ plates, variables }) => [...plates, ...variables.map(({ value }) => value)])
      .flatMap((label) => (label.object ? [[label.object.id, label.object] as const] : [])),
  );

/**
 * Every object a plate or a variable has pointed to, up to and including a step run, in the order the replay first
 * saw them, each as it was then.
 */
export function objectsSeen(analysis: Analysis, at: number) {
  const objects = new Map(analysis.objects.map((object) => [object.id, object]));
  const seen = new Map<string, ObjectFact>();
  for (const run of analysis.runs.slice(0, at + 1)) {
    for (const change of run.objects ?? []) objects.set(change.object, { ...objects.get(change.object)!, repr: change.repr });
    const labels = [...(run.plates ?? []).flatMap(({ put }) => put), ...(run.variables ?? []).flatMap((change) => ('value' in change ? [change.value] : []))];
    for (const { object } of labels) if (object) seen.set(object, objects.get(object)!);
  }
  return [...seen.values()].map((object) => objects.get(object.id)!);
}

/** The steps of one code object, in order. */
export const stepsOf = (analysis: Analysis, code: number) => allSteps(analysis).filter((step) => step.code === code);

/** A code object, in words: your program, a function's name such as greet, a lambda or a generator expression. */
export function codeName(code: CodeObject) {
  if (code.name === '<module>') return 'your program';
  if (code.name === '<lambda>') return 'a lambda';
  if (code.name === '<genexpr>') return 'a generator expression';
  return code.qualname;
}
