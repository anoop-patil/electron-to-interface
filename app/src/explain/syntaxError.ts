import type { Analysis, Position, SyntaxErrorSlot } from '../generated/analysis';
import { charLabel, linesOf, type CharSpan } from '../zoom/characters';
import { fill, fillString, template, type Explanation, type TemplateId } from './explain';
import { stoppedAt, syntaxErrorOf, whereStopped } from './stopped';

const CLOSERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const OPENERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const CURLY_QUOTES = new Set(['‘', '’', '“', '”']);

type Slots = Partial<Record<SyntaxErrorSlot, string>>;

/**
 * The Templates for common syntax errors, by Python's message, with the slots each message fills. A block with
 * nothing in it, at the end of the Program, has a Template of its own: the line Python points at is the block's own.
 */
const KINDS: { pattern: RegExp; id(match: RegExpExecArray, line: string): TemplateId; slots?(match: RegExpExecArray): Slots }[] = [
  { pattern: /^unterminated triple-quoted [ft]?-?string literal/, id: () => 'syntaxError.unterminatedTriple' },
  { pattern: /^unterminated [ft]?-?string literal/, id: () => 'syntaxError.unterminatedString' },
  { pattern: /^'([([{])' was never closed$/, id: () => 'syntaxError.neverClosed', slots: ([, bracket]) => ({ bracket, closer: CLOSERS[bracket] }) },
  { pattern: /^unmatched '([)\]}])'$/, id: () => 'syntaxError.unmatched', slots: ([, bracket]) => ({ bracket, opener: OPENERS[bracket] }) },
  {
    pattern: /^closing parenthesis '([)\]}])' does not match opening parenthesis '([([{])'/,
    id: () => 'syntaxError.mismatched',
    slots: ([, bracket, opener]) => ({ bracket, opener, closer: CLOSERS[opener] }),
  },
  { pattern: /^expected ':'$/, id: () => 'syntaxError.expectedColon' },
  {
    pattern: /^invalid character '(.+)' \((U\+[0-9A-F]+)\)$/u,
    id: ([, character]) => (CURLY_QUOTES.has(character) ? 'syntaxError.invalidQuote' : 'syntaxError.invalidCharacter'),
    slots: ([, character, codePoint]) => ({ character, codePoint }),
  },
  { pattern: /^Missing parentheses in call to 'print'/, id: () => 'syntaxError.printParentheses' },
  { pattern: /Perhaps you forgot a comma\?$/, id: () => 'syntaxError.forgotComma' },
  { pattern: /^invalid syntax\. Maybe you meant '==' or ':=' instead of '='\?$/, id: () => 'syntaxError.equalsInTest' },
  { pattern: /^unexpected indent$/, id: () => 'syntaxError.unexpectedIndent' },
  {
    pattern: /^expected an indented block after (.+) on line (\d+)$/,
    id: ([, , blockLine], line) => (blockLine === line ? 'syntaxError.expectedIndentAtEnd' : 'syntaxError.expectedIndent'),
    slots: ([, block, blockLine]) => ({ block: block.replaceAll("'", ''), blockLine }),
  },
  { pattern: /^unindent does not match any outer indentation level$/, id: () => 'syntaxError.unindentMismatch' },
];

/** What `more` says, by the zoom level where Python stopped. */
const STOPPED: Record<3 | 4 | 5, TemplateId> = { 3: 'syntaxError.stoppedTokens', 4: 'syntaxError.stoppedStructure', 5: 'syntaxError.stoppedSteps' };

/** A place in the Program, as a position in its characters. A column past the line's newline is the next line's start. */
function charAt(analysis: Analysis, { line, column }: Position) {
  const { chars } = linesOf(analysis.program)[line - 1];
  return chars[column]?.index ?? chars.at(-1)!.index + 1;
}

/** The code the Program's syntax error points at, in characters: one character, or up to the end Python names. */
export function errorSpan(analysis: Analysis): CharSpan | null {
  const { start, end } = syntaxErrorOf(analysis) ?? {};
  if (!start) return null;
  const from = charAt(analysis, start);
  return { start: from, end: end ? Math.max(charAt(analysis, end), from + 1) : from + 1 };
}

export function syntaxErrorFacts(analysis: Analysis): Record<SyntaxErrorSlot, string> {
  const error = syntaxErrorOf(analysis)!;
  const chars = Array.from(analysis.program);
  const span = errorSpan(analysis);
  const line = error.start ? linesOf(analysis.program)[error.start.line - 1].chars.map(({ char }) => char).join('') : '';
  const empty = { bracket: '', opener: '', closer: '', character: '', codePoint: '', block: '', blockLine: '' };
  return {
    ...empty,
    kind: error.type,
    message: error.message,
    line: String(error.start?.line ?? error.line ?? ''),
    code: line.trim(),
    at: span ? chars.slice(span.start, span.end).map((char) => (char === '\n' ? charLabel(char) : char)).join('') : '',
    stoppedAt: whereStopped(analysis),
  };
}

/**
 * The plain-English Explanation of the Program's syntax error, or null if it has none: what went wrong, from the
 * Template for Python's message; Python's own words, in small print; and where Python stopped.
 */
export function explainSyntaxError(analysis: Analysis): Explanation | null {
  const error = syntaxErrorOf(analysis);
  if (!error) return null;
  let facts = syntaxErrorFacts(analysis);
  let id: TemplateId = error.start ? 'syntaxError.general' : 'syntaxError.noPlace';
  for (const kind of error.start ? KINDS : []) {
    const match = kind.pattern.exec(error.message);
    if (!match) continue;
    id = kind.id(match, facts.line);
    facts = { ...facts, ...kind.slots?.(match) };
    break;
  }
  return {
    ...fill(template(id, 'syntaxError'), facts),
    term: fillString(template('syntaxError.term', 'syntaxError').text, facts),
    more: fillString(template(STOPPED[stoppedAt(analysis)!], 'syntaxError').text, facts),
  };
}
