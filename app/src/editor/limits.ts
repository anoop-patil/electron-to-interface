import { FILE_NAME } from '../explain/commands';
import { counted } from '../explain/explain';
import type { Analysis } from '../generated/analysis';

/** The most lines a Program can have (ADR 0006). */
export const LINE_LIMIT = 20;

/** How many lines the editor's code has as a Program, which the analyzer ends with a newline if it hasn't one. */
const linesIn = (code: string) => (code.endsWith('\n') ? code : `${code}\n`).split('\n').length - 1;

/** The longest name, before `.py`, an uploaded file keeps, so the commands stay short enough to read on a phone. */
const LONGEST_NAME = 40;

/**
 * The name the Try it yourself commands use for an uploaded file. The learner types it in a terminal, so it keeps only
 * letters, digits, `_`, `.` and `-`: accents come off, any other run of characters becomes one `_`, and a leading `-`
 * or `.` goes, so the name never reads as an option or a hidden file. It always ends in `.py`.
 */
export function fileNameFor(uploaded: string) {
  const stem = uploaded
    .trim()
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9_.-]+/)
    .filter(Boolean)
    .join('_')
    .replace(/^[.-]+/, '')
    .slice(0, LONGEST_NAME);
  return stem ? `${stem}.py` : FILE_NAME;
}

/** What the editor says while the code is over the line limit, and Run is off; null while it fits. */
export function lineLimitNote(code: string) {
  const lines = linesIn(code);
  if (lines <= LINE_LIMIT) return null;
  return `Your program is ${lines} lines long. A program here can have up to ${LINE_LIMIT}, so Run is off until you take out ${counted(lines - LINE_LIMIT, 'line', 'lines')}.`;
}

/**
 * What the editor says after a Run that stopped at an import of a package outside Python's standard library, the only
 * one there is here; null after any other Run.
 */
export function importNote({ error }: Analysis) {
  if (!error?.module || error.standardLibrary !== false) return null;
  const where = error.line ? ` on line ${error.line}` : '';
  return `Your program stopped${where} because it imports ${error.module}, which isn’t part of Python’s standard library. Only the standard library is available here: it comes with the Python running in your browser, and nothing else can be installed.`;
}
