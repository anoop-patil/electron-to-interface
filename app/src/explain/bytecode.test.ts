// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, expect, test } from 'vitest';
import { startPython, type Python } from '../engine/python';
import type { Analysis } from '../generated/analysis';
import { mapState } from '../machine/mapState';
import { allSteps } from './bytecode';
import { explainAfterRun, explainStep, level5Selection, stepTitle } from './steps';
import { programFacts, type Span } from './explain';

let python: Python;
let greet: Analysis;

const plain = (spans: Span[] | undefined) => (spans ?? []).map((span) => span.text).join('');

beforeAll(async () => {
  python = await startPython();
  const captured = JSON.parse(await readFile('../prototype/data/example-greet-cpython-3.14.2.json', 'utf-8'));
  greet = python.analyze(captured.source, captured.file);
}, 60_000);

/** The Selection at level 5, for a Program that has steps. */
const selected = (analysis: Analysis, id: string) => level5Selection(analysis, id)!;

/** The step run of a step, counted from 1, by its code object and offset. */
function runOf(analysis: Analysis, code: number, offset: number, nth = 1) {
  return analysis.runs.filter((run) => run.code === code && run.offset === offset)[nth - 1].id;
}

test('each of greet.py’s steps has a plain name first, from its Template', () => {
  const titles = allSteps(greet).map((step) => `${plain(stepTitle(greet, step))} · ${step.step.opname}`);

  expect(titles).toEqual([
    'Get ready · RESUME',
    'Get greet’s steps · LOAD_CONST',
    'Make a function · MAKE_FUNCTION',
    'Call it greet · STORE_NAME',
    "Get ('Ada', 'Grace') · LOAD_CONST",
    'Start walking through it · GET_ITER',
    'Take the next item, or stop · FOR_ITER',
    'Call it person · STORE_NAME',
    'Find greet · LOAD_NAME',
    'Add an empty plate · PUSH_NULL',
    'Find person · LOAD_NAME',
    'Call greet with 1 thing · CALL',
    'Throw away the answer · POP_TOP',
    'Back to the top of the loop · JUMP_BACKWARD',
    'End of the loop · END_FOR',
    'Put the walker away · POP_ITER',
    'Get None · LOAD_CONST',
    'Hand back the answer · RETURN_VALUE',
    'Get ready · RESUME',
    'Find print, plus an empty plate · LOAD_GLOBAL',
    "Get 'Hello,' · LOAD_CONST",
    'Get name · LOAD_FAST_BORROW',
    'Call print with 2 things · CALL',
    'Throw away the answer · POP_TOP',
    'Get None · LOAD_CONST',
    'Hand back the answer · RETURN_VALUE',
  ]);
});

test('the Selection at level 5 is a step run, or a step that never ran; with no Selection, the first step run', () => {
  expect(level5Selection(greet, 'run-11')).toMatchObject({ step: { step: { opname: 'CALL' }, code: 0 }, run: 11 });
  expect(level5Selection(greet, 'bc-14')).toMatchObject({ step: { step: { opname: 'END_FOR' } }, run: null });
  expect(level5Selection(greet, null)).toMatchObject({ step: { step: { opname: 'RESUME' } }, run: 0 });
  // A step that ran is selected through its first run.
  expect(level5Selection(greet, 'bc-8')).toMatchObject({ step: { step: { opname: 'LOAD_NAME' } }, run: 8 });
});

test('a run of FOR_ITER says which trip round the loop it is, and what it took from the walker', () => {
  const { step, run } = selected(greet, runOf(greet, 0, 12, 2));
  const explanation = explainStep(greet, step, run);

  expect(plain(explanation.term)).toBe('FOR_ITER 11 (to L2) · step 7 of your program, run 2 of 3');
  expect(plain(explanation.text)).toContain('Trip 2 round the loop.');
  expect(plain(explanation.more)).toBe("This time it put 'Grace' on a plate.");
});

test('the last run of FOR_ITER says the loop ended, and where the program went next', () => {
  const { step, run } = selected(greet, runOf(greet, 0, 12, 3));

  expect(plain(explainStep(greet, step, run).text)).toBe('Trip 3 round the loop. The walker has no items left, so the loop ends: Python jumps out of it, to step 16.');
});

test('a call to print says what it printed, and a call to greet that Python sets up a frame for it', () => {
  const print = selected(greet, runOf(greet, 1, 16));
  const call = selected(greet, runOf(greet, 0, 24));

  expect(plain(explainStep(greet, print.step, print.run).more)).toBe('print wrote a line to the terminal: Hello, Ada');
  expect(plain(explainStep(greet, call.step, call.run).more)).toContain('it sets up a fresh frame for greet');
});

test('a step that never ran says so', () => {
  const { step, run } = selected(greet, 'bc-14');
  const explanation = explainStep(greet, step, run);

  expect(plain(explanation.title)).toBe('End of the loop');
  expect(plain(explanation.term)).toBe('END_FOR · step 15 of your program, never ran');
  expect(plain(explanation.more)).toBe('This step never ran for your program.');
});

test('a step Python rewrote in the unwatched run says what it became; one it didn’t says nothing', () => {
  const [, loadConst] = allSteps(greet);
  const makeFunction = allSteps(greet)[2];

  expect(plain(explainAfterRun(greet, loadConst) ?? undefined)).toContain('LOAD_CONST_MORTAL');
  expect(explainAfterRun(greet, makeFunction)).toBeNull();
});

test('a step without a Template of its own gets the general one, naming its opname', () => {
  const analysis = python.analyze('x = 5\ny = ~x');
  const invert = allSteps(analysis).find(({ step }) => step.opname === 'UNARY_INVERT')!;

  expect(plain(stepTitle(analysis, invert))).toBe('A UNARY_INVERT step');
});

test('the Program’s lists of steps, its steps and its step runs are counted in words', () => {
  expect(programFacts(greet)).toMatchObject({ lists: 'one for your program, and one for greet', steps: '26 steps', ran: '42 step runs' });
  expect(programFacts(python.analyze('print(1)')).lists).toBe('one list, for your program');
});

test('at level 5 the Machine map lights your steps, the objects and the plates, with counts across frames', () => {
  const selection = runOf(greet, 1, 14);
  const { lit } = mapState({ level: 5, analysis: greet, selection });

  expect(lit.map(({ part, note }) => [part, plain(note)])).toEqual([
    ['ram', ''],
    ['code', 'greet, step 4 · run 16 of 42'],
    ['stack', '5 plates, in 2 frames'],
    ['heap', '4 objects in use'],
  ]);
});
