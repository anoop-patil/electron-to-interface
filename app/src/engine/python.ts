import { loadPyodide } from 'pyodide';
import analyzerSource from '../../analyzer/analyze.py?raw';
import { FILE_NAME, tryItCommands } from '../explain/commands';
import type { Analysis } from '../generated/analysis';

export interface Python {
  /** Analyzes the Program, saved as `fileName` for the Try it yourself commands, which run on it. */
  analyze(code: string, fileName?: string): Analysis;
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
  // The commands run in Python's working folder, /home/pyodide, so that is the folder a traceback names.
  pyodide.runPython('import json', { globals: namespace });
  const analyzeToJson = pyodide.runPython('lambda code, file, commands: json.dumps(analyze(code, file, json.loads(commands)))', { globals: namespace });

  return {
    analyze(code, fileName = FILE_NAME) {
      return JSON.parse(analyzeToJson(code, fileName, JSON.stringify(tryItCommands(fileName)))) as Analysis;
    },
  };
}
