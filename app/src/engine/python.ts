import analyzerSource from '../../analyzer/analyze.py?raw';
import { startAnalyzer, type Python } from './analyzer';

export type { Python };

/**
 * Starts Python 3.14.2 (Pyodide) with the analyzer loaded.
 * In the browser, indexURL is where our own site serves Pyodide's files (ADR 0004);
 * under Node, Pyodide finds them in node_modules.
 */
export const startPython = (options: { indexURL?: string } = {}): Promise<Python> => startAnalyzer(analyzerSource, options);
