import { expect, test } from 'vitest';
import type { AstFact, ProgramError } from '../generated/analysis';
import { analysisOf, greetAnalysis, helloWorld, tokensOf } from '../testAnalysis';
import { explainProgram, type Explanation, type Span } from './explain';
import { stoppedAt, syntaxErrorOf } from './stopped';
import { errorSpan, explainSyntaxError } from './syntaxError';

const plain = (spans: Span[] | undefined) => spans?.map((span) => span.text).join('');
const docsOf = ({ docs }: Explanation) => docs && { text: plain(docs.text), href: docs.href };

/** The syntax-error Example: tokenize stops at the quote mark that starts the unclosed text on line 3. */
const EXAMPLE = 'names = ["Ada", "Grace"]\nfor name in names:\n    print("Hello, name)\nprint("Done")\n';

const exampleAnalysis = () =>
  analysisOf(EXAMPLE, [], {
    tokens: tokensOf(EXAMPLE, [
      ['NAME', 'names', [1, 0], [1, 5]],
      ['NEWLINE', '\n', [1, 24], [1, 25]],
      ['INDENT', '    ', [3, 0], [3, 4]],
      ['NAME', 'print', [3, 4], [3, 9]],
      ['OP', '(', [3, 9], [3, 10], 'LPAR'],
    ]),
    error: { type: 'SyntaxError', message: 'unterminated string literal (detected at line 3)', line: 3, start: { line: 3, column: 10 } },
  });

/** A Program whose tokens and tree Python found, up to `stage`, with a syntax error. */
function stoppedProgram(program: string, error: ProgramError, stage: 4 | 5) {
  const tokens = tokensOf(program, [['ENDMARKER', '', [2, 0], [2, 0]]]);
  const ast = stage === 5 ? [{ id: 'ast-0', type: 'Module' } as AstFact] : [];
  return analysisOf(program, [], { tokens, ast, error });
}

test('a Program has a syntax error only if Python made no steps from it, so a SyntaxError raised as it ran is not one', () => {
  expect(syntaxErrorOf(helloWorld())).toBeNull();
  expect(syntaxErrorOf(exampleAnalysis())?.type).toBe('SyntaxError');

  const ran = { ...greetAnalysis(), error: { type: 'SyntaxError', message: 'invalid syntax', line: 1 } };
  expect(syntaxErrorOf(ran)).toBeNull();
  expect(stoppedAt(ran)).toBeNull();
});

test('Python stopped at tokens if they stop short, at the structure if it found no tree, else at the steps', () => {
  expect(stoppedAt(helloWorld())).toBeNull();
  expect(stoppedAt(exampleAnalysis())).toBe(3);
  expect(stoppedAt(stoppedProgram('for c in x\n', { type: 'SyntaxError', message: "expected ':'", line: 1, start: { line: 1, column: 10 } }, 4))).toBe(4);
  expect(stoppedAt(stoppedProgram('return 5\n', { type: 'SyntaxError', message: "'return' outside function", line: 1, start: { line: 1, column: 0 } }, 5))).toBe(5);
  expect(plain(explainProgram('level5.noBytecode', exampleAnalysis()).text)).toBe(
    'Python made no steps from your program: it stopped at a syntax error at zoom level 3, Tokens, before it got this far.',
  );
});

test('the code Python points at is one character, or up to the end it names, counted in characters', () => {
  expect(errorSpan(exampleAnalysis())).toEqual({ start: EXAMPLE.indexOf('"Hello'), end: EXAMPLE.indexOf('"Hello') + 1 });

  // A colon belongs where the newline is; é is one character.
  const colon = stoppedProgram('for c in "é"\n', { type: 'SyntaxError', message: "expected ':'", line: 1, start: { line: 1, column: 12 }, end: { line: 1, column: 13 } }, 4);
  expect(errorSpan(colon)).toEqual({ start: 12, end: 13 });
  expect(errorSpan(helloWorld())).toBeNull();
});

test('the Example’s syntax error, explained in plain English, with Python’s own words in small print and where it stopped', () => {
  const explanation = explainSyntaxError(exampleAnalysis())!;

  expect(plain(explanation.title)).toBe('Line 3: a piece of text has no closing quote mark');
  expect(plain(explanation.term)).toBe('SyntaxError: unterminated string literal (detected at line 3)');
  expect(plain(explanation.text)).toBe(
    'On line 3, a piece of text starts at the place Python points at, but the line ends before a quote mark closes it. Python reads everything after an opening quote mark as text, so it can’t tell where yours was meant to stop. Put the closing quote mark where the text ends.',
  );
  expect(plain(explanation.more)).toBe(
    'Python stopped at this while splitting your code into tokens, at zoom level 3, Tokens, so the tokens stop short. It never worked out your program’s structure, made no steps and ran none of it.',
  );
});

test('each common syntax error has its own explanation, filled in from Python’s message', () => {
  const explain = (message: string, type = 'SyntaxError') =>
    explainSyntaxError(stoppedProgram('x = (1, 2]\n', { type, message, line: 1, start: { line: 1, column: 9 } }, 4))!;

  expect(plain(explain("'(' was never closed").title)).toBe('Line 1: the bracket ( is never closed');
  expect(plain(explain("'[' was never closed").text)).toContain('looking for the matching ], and didn’t find it.');
  expect(plain(explain("unmatched ')'").text)).toBe('Line 1 has a closing bracket, ), but no ( is open for it to close. Every closing bracket needs an opening one before it.');
  expect(plain(explain("closing parenthesis ']' does not match opening parenthesis '('").text)).toBe(
    'On line 1, ] tries to close a bracket that was opened with (. A bracket has to close with its own shape: ( with ).',
  );
  expect(plain(explain("expected ':'").title)).toBe('Line 1: a colon is missing');
  expect(plain(explain("invalid character '“' (U+201C)").title)).toBe('Line 1: “ is a curly quote mark');
  expect(plain(explain("invalid character '€' (U+20AC)").text)).toContain('the character € (U+20AC)');
  expect(plain(explain("Missing parentheses in call to 'print'. Did you mean print(...)?").title)).toBe('Line 1: print needs brackets');
  expect(plain(explain('invalid syntax. Perhaps you forgot a comma?').title)).toBe('Line 1: a comma is probably missing');
  expect(plain(explain("invalid syntax. Maybe you meant '==' or ':=' instead of '='?").title)).toBe('Line 1: = can’t go here');
  expect(plain(explain('unexpected indent', 'IndentationError').title)).toBe('Line 1 is indented more than Python expects');
  const unindented = stoppedProgram('for i in x:\nprint(i)\n', { type: 'IndentationError', message: "expected an indented block after 'for' statement on line 1", line: 2, start: { line: 2, column: 0 } }, 4);
  expect(plain(explainSyntaxError(unindented)!.text)).toMatch(/^The for statement on line 1 ends with a colon.* Line 2 isn’t indented any further/);
  // A block at the end of the Program: Python points at the block's own line.
  expect(plain(explain("expected an indented block after 'for' statement on line 1", 'IndentationError').text)).toMatch(/^The for statement on line 1 ends with a colon.* Your program ends there/);
  expect(plain(explain('unindent does not match any outer indentation level', 'IndentationError').title)).toBe('Line 1’s indentation doesn’t line up');
});

test('any other syntax error gets a general explanation that quotes Python, and one with no place says so', () => {
  const program = 'x = 1 +\n';
  const general = explainSyntaxError(stoppedProgram(program, { type: 'SyntaxError', message: 'invalid syntax', line: 1, start: { line: 1, column: 7 } }, 4))!;
  expect(plain(general.title)).toBe('Python can’t read line 1');
  expect(plain(general.text)).toBe('Python stopped at the place it points at on line 1: the code there breaks Python’s rules for how code is written. Its message is invalid syntax.');
  expect(plain(general.more)).toBe('Python stopped at this when it tried to work out your program’s structure, at zoom level 4, Structure, so it made no steps and ran none of it.');
  expect(docsOf(general)).toEqual({
    text: 'Read about SyntaxError in Python’s documentation',
    href: 'https://docs.python.org/3.14/library/exceptions.html#SyntaxError',
  });

  const nowhere = explainSyntaxError(stoppedProgram(program, { type: 'SyntaxError', message: 'invalid syntax' }, 4))!;
  expect(plain(nowhere.title)).toBe('Python can’t read your program');
  expect(docsOf(nowhere)?.href).toBe('https://docs.python.org/3.14/library/exceptions.html#SyntaxError');
  // A syntax error with words of its own needs no link.
  expect(explainSyntaxError(exampleAnalysis())!.docs).toBeUndefined();

  const compiled = explainSyntaxError(stoppedProgram('return 5\n', { type: 'SyntaxError', message: "'return' outside function", line: 1, start: { line: 1, column: 0 } }, 5))!;
  expect(plain(compiled.more)).toBe('Python worked out your program’s structure, but stopped at this when it compiled it into steps, at zoom level 5, Bytecode, so it made no steps and ran none of it.');
});
