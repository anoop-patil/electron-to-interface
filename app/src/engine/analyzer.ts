import { loadPyodide } from 'pyodide';
import { FILE_NAME, tryItCommands } from '../explain/commands';
import type { Analysis } from '../generated/analysis';

export interface Python {
  /**
   * Analyzes the Program, saved as `fileName` for the Try it yourself commands, which run on it. `clock`, if given, is
   * told `true` as the Program or a command starts running and `false` as it stops.
   */
  analyze(code: string, fileName?: string, clock?: (running: boolean) => void): Analysis;
}

/**
 * Starts Python 3.14.2 (Pyodide) with the analyzer, whose Python source is `analyzerSource`, loaded. The page runs it in
 * a Web Worker; the build runs it under Node.js to make the Examples' Analyses.
 */
export async function startAnalyzer(analyzerSource: string, options: { indexURL?: string } = {}): Promise<Python> {
  const pyodide = await loadPyodide(options);
  const namespace = pyodide.globals.get('dict')();
  pyodide.runPython(analyzerSource, { globals: namespace });
  // The commands run in Python's working folder, /home/pyodide, so that is the folder a traceback names.
  pyodide.runPython('import json', { globals: namespace });
  const analyzeToJson = pyodide.runPython('lambda code, file, commands, clock: json.dumps(analyze(code, file, json.loads(commands), clock=clock))', { globals: namespace });

  return {
    analyze(code, fileName = FILE_NAME, clock) {
      return JSON.parse(analyzeToJson(code, fileName, JSON.stringify(tryItCommands(fileName)), clock)) as Analysis;
    },
  };
}
