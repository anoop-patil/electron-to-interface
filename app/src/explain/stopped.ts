import type { Analysis } from '../generated/analysis';
import { levelInfo } from '../zoom/levels';

/** Python's kinds of syntax error. */
const SYNTAX_ERRORS = new Set(['SyntaxError', 'IndentationError', 'TabError']);

/**
 * The syntax error that stopped the Program before it ran, or null. Python made no steps from such a Program; a
 * SyntaxError raised while a Program ran, by eval for example, is an ordinary error.
 */
export const syntaxErrorOf = ({ bytecode, error }: Analysis) => (bytecode.length === 0 && error && SYNTAX_ERRORS.has(error.type) ? error : null);

/**
 * The zoom level where Python stopped at the Program's syntax error, or null if it has none: 3 if its tokens stop
 * short, 4 if Python found no syntax tree, else 5, compiling the tree into steps.
 */
export function stoppedAt(analysis: Analysis): 3 | 4 | 5 | null {
  if (!syntaxErrorOf(analysis)) return null;
  if (analysis.tokens.at(-1)?.type !== 'ENDMARKER') return 3;
  return analysis.ast.length === 0 ? 4 : 5;
}

/** That zoom level, in words: zoom level 3, Tokens. */
export function whereStopped(analysis: Analysis) {
  const level = stoppedAt(analysis);
  return level ? `zoom level ${level}, ${levelInfo(level).title}` : '';
}
