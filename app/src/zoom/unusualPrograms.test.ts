// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeAll, describe, expect, test } from 'vitest';
import { ConceptsProvider } from '../concepts/ConceptsProvider';
import { startPython } from '../engine/python';
import { allSteps, runsOfStep } from '../explain/bytecode';
import { explainToken } from '../explain/explain';
import { outputLines, pixelId, stageId } from '../explain/output';
import { explainLevel9, level9 } from '../explain/pixels';
import { explainAfterRun, explainStep } from '../explain/steps';
import { syntaxErrorOf } from '../explain/stopped';
import { explainNode, treeLabel } from '../explain/syntaxTree';
import { explainTryIt } from '../explain/tryIt';
import type { Analysis } from '../generated/analysis';
import { mapState } from '../machine/mapState';
import { LAST_LEVEL } from './levels';
import { charsOf, selectionAt } from './selection';
import { ZoomView } from './ZoomView';

/** The test program set: Programs within the limits that use what the Examples don't, from decorators to `match`. */
const FOLDER = new URL('../../test-programs/', import.meta.url);
const PROGRAMS = readdirSync(FOLDER)
  .filter((file) => file.endsWith('.py'))
  .map((file) => ({ file, source: readFileSync(new URL(file, FOLDER), 'utf8') }));

/** Each Program's Analysis, by its file. */
const analyses = new Map<string, Analysis>();

beforeAll(async () => {
  const python = await startPython();
  for (const { file, source } of PROGRAMS) analyses.set(file, python.analyze(source));
}, 120_000);

/** At most `count` of the items, spread evenly, with the first and the last. */
function spread<T>(items: T[], count: number) {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, at) => items[Math.round((at * (items.length - 1)) / (count - 1))]);
}

/** Each step's first and last run, or the step itself if it never ran: what level 5 can select. */
const stepRuns = (analysis: Analysis) =>
  allSteps(analysis).flatMap(({ step }) => {
    const runs = runsOfStep(analysis, step);
    return runs.length === 0 ? [step.id] : [...new Set([runs[0], runs.at(-1)!])].map((at) => analysis.runs[at].id);
  });

/** Each zoom level's own elements, which the learner can select there. */
function elementsAt(analysis: Analysis, level: number): string[] {
  const lines = outputLines(analysis);
  if (level === 2) return analysis.bytes.map((byte) => byte.id);
  if (level === 3) return analysis.tokens.map((token) => token.id);
  if (level === 4) return analysis.ast.map((node) => node.id);
  if (level >= 5 && level <= 7) return stepRuns(analysis);
  if (level === 8) return lines.flatMap((line) => [1, 2, 3, 4, 5].map((stage) => stageId(line, stage)));
  if (level === 9) return lines.flatMap((line) => Array.from(line.text, (_, at) => pixelId(line, at)));
  return [];
}

/**
 * Shows a zoom level for a Selection, as the page does: the level, its Try it yourself and the Machine map. Level 9
 * measures the learner's screen, which only a browser has, so it is worked out rather than drawn.
 */
function zoomTo(level: number, analysis: Analysis, selection: string | null) {
  if (level === 9) {
    const view = level9(analysis, selection);
    if (view) explainLevel9(view);
    explainTryIt(level, analysis, selection);
  } else {
    const view = createElement(ZoomView, { level, analysis, selection, onSelect() {}, onGo() {}, viewRef: null });
    renderToString(createElement(ConceptsProvider, null, view));
  }
  mapState({ level, analysis, selection });
  if (selection) charsOf(analysis, selection);
}

/** Every element's Explanation, at the levels with a Template for each kind of element: tokens, boxes and steps. */
function explainEveryElement(analysis: Analysis) {
  return [
    ...analysis.tokens.map((token) => explainToken(analysis, token)),
    ...analysis.ast.map((node) => (treeLabel(analysis, node), explainNode(analysis, node))),
    ...allSteps(analysis).flatMap((found) => {
      explainAfterRun(analysis, found);
      return [null, ...runsOfStep(analysis, found.step).slice(0, 3)].map((at) => explainStep(analysis, found, at));
    }),
  ];
}

describe.each(PROGRAMS)('$file', ({ file, source }) => {
  test('is within the limits: 20 lines at most', () => {
    expect(source.split('\n').length - 1).toBeLessThanOrEqual(20);
  });

  test('zooms through every level without an error', () => {
    const analysis = analyses.get(file)!;
    expect(syntaxErrorOf(analysis), 'Python reads every Program in the set').toBeNull();
    explainEveryElement(analysis);
    for (let level = 1; level <= LAST_LEVEL; level++) {
      // Drawing a level takes a while, so it is drawn for some of its elements, spread through the Program.
      for (const element of [null, ...spread(elementsAt(analysis, level), 12)]) {
        const selection = selectionAt(analysis, element, level);
        try {
          zoomTo(level, analysis, selection);
        } catch (error) {
          throw new Error(`${file}, level ${level}, ${selection}: ${(error as Error).stack}`);
        }
      }
    }
  }, 60_000);
});

test('the set reaches a token, a box with and without a place in the code, and a step that have no Template of their own', () => {
  // The links to Python's documentation that the set's Explanations give: only a general Template has one.
  const linked = new Set([...analyses.values()].flatMap((analysis) => explainEveryElement(analysis).flatMap(({ docs }) => (docs ? [docs.href] : []))));
  const pages = [...linked].map((href) => href.replace(/#.*/, ''));
  expect(new Set(pages)).toEqual(
    new Set(['https://docs.python.org/3.14/library/token.html', 'https://docs.python.org/3.14/library/ast.html', 'https://docs.python.org/3.14/library/dis.html']),
  );
  expect([...linked]).toContain('https://docs.python.org/3.14/library/ast.html#ast.Match');
  expect([...linked]).toContain('https://docs.python.org/3.14/library/ast.html#ast.comprehension');
});
