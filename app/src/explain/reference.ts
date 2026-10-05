import libraryFile from '../../reference/cpython-3.14.2.json';
import type { Analysis, HandlerRun, ReferenceExample, ReferenceLibrary, Step } from '../generated/analysis';

/**
 * The Reference Library for Python 3.14.2. The build checks it against the schema and every quoted line against the C
 * source (see checkContent.ts); `unknown` is needed only because JSON's arrays don't type as the schema's non-empty lists.
 */
export const LIBRARY = libraryFile as unknown as ReferenceLibrary;

const examples = new WeakMap<Analysis, ReferenceExample | null>();

/**
 * The Example the Reference Library recorded the handlers of, if the Program is one: the same Program, whose steps
 * ran in the same order. Null for any other Program, or a run cut short.
 */
export function exampleOf(analysis: Analysis): ReferenceExample | null {
  if (!examples.has(analysis)) {
    const found = LIBRARY.examples.find(
      ({ program, runs }) =>
        program === analysis.program &&
        !analysis.runsCutShort &&
        runs.length === analysis.runs.length &&
        runs.every((run, at) => run.code === analysis.runs[at].code && run.offset === analysis.runs[at].offset),
    );
    examples.set(analysis, found ?? null);
  }
  return examples.get(analysis)!;
}

/**
 * The handlers that ran for a step run, as places in the Reference Library: for a step that never ran, its general
 * form. Empty unless the Program is an Example, whose handlers were recorded.
 */
export function handlersRun(analysis: Analysis, step: Step, at: number | null): HandlerRun[] {
  const example = exampleOf(analysis);
  if (!example) return [];
  if (at !== null) return example.runs[at].handlers;
  return step.opname in LIBRARY.entries ? [{ entry: step.opname }] : [];
}

/** The handler an entry quotes: CALL/rewrites quotes CALL. */
export const handlerOf = (entry: string) => entry.split('/')[0];
