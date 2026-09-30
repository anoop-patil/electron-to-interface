import { loadPyodide } from 'pyodide';
import analyzerSource from '../../analyzer/analyze.py?raw';
import type { Analysis } from '../generated/analysis';

export interface Python {
  analyze(code: string): Analysis;
}

/**
 * Starts Python 3.14.2 (Pyodide) with the analyzer loaded.
 * In the browser, indexURL is where our own site serves Pyodide's files (ADR 0004);
 * under Node, Pyodide finds them in node_modules.
 */
export async function startPython(options: { indexURL?: string } = {}): Promise<Python> {
  const pyodide = await loadPyodide(options);
  const namespace = pyodide.globals.get('dict')();
  pyodide.runPython(analyzerSource, { globals: namespace });
  const analyzeToJson = pyodide.runPython(
    'lambda code: __import__("json").dumps(analyze(code))',
    { globals: namespace },
  );

  return {
    analyze(code) {
      return JSON.parse(analyzeToJson(code)) as Analysis;
    },
  };
}
