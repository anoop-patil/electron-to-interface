import { expect, test } from 'vitest';
import { analysisOf, greetAnalysis, helloWorld, tokensOf } from '../testAnalysis';
import { explainProgram, explainToken, type Explanation, type Span } from './explain';

const plain = (spans: Span[] | undefined) => spans?.map((span) => span.text).join('');
const docsOf = ({ docs }: Explanation) => docs && { text: plain(docs.text), href: docs.href };

const greet = greetAnalysis();

/** The Explanation of the first token of `greet` with this type and text. */
const explainGreet = (type: string, text?: string) => {
  const token = greet.tokens.find((other) => other.type === type && (text === undefined || other.text === text))!;
  const explanation = explainToken(greet, token);
  return { title: plain(explanation.title), text: plain(explanation.text), term: plain(explanation.term), more: plain(explanation.more) };
};

test('level 3’s introduction and caption count the Program’s bytes and tokens', () => {
  const hello = helloWorld();

  expect(plain(explainProgram('level3.intro', hello).text)).toBe(
    'To understand code, Python first needs its words, just as you read words rather than single letters. So it decodes your 22 bytes into text and picks out the meaningful pieces, called tokens. In Python, indentation matters, so the tokens also mark where an indented block starts and ends.',
  );
  expect(explainProgram('level3.intro', hello).text).toContainEqual({ text: 'tokens', concept: 'token' });
  expect(plain(explainProgram('level3.caption', hello).text)).toBe('Your program, line by line, as the 6 tokens Python found. Select one to see what it is.');
  expect(plain(explainProgram('level3.encoding', hello).text)).toBe('ENCODING comes before line 1: Python’s note that it read your bytes as utf-8. It isn’t part of your code.');
});

test('a token explains what it is, where it sits in tokenize’s own notation, and its bytes', () => {
  const hello = helloWorld();
  const print = explainToken(hello, hello.tokens[0]);

  expect(plain(print.title)).toBe('print is a name');
  expect(plain(print.text)).toBe('Python has read the letters of print and decided they form one word: a name. It doesn’t know yet what the name means.');
  expect(plain(print.term)).toBe('NAME');
  expect(plain(print.more)).toBe('Where: line 1, columns 0 to 4. tokenize writes this as 1,0-1,5. Bytes: 112 114 105 110 116.');

  const string = explainToken(hello, hello.tokens[2]);
  expect(plain(string.title)).toBe('"Hello World!" is one piece of text');
  expect(plain(string.text)).toBe('The whole text is one token, quote marks included. Python saw the opening quote mark and kept reading until the closing one.');
});

test('punctuation says which kind it is, as tokenize names it', () => {
  const hello = helloWorld();

  expect(plain(explainToken(hello, hello.tokens[1]).title)).toBe('( is punctuation');
  expect(plain(explainToken(hello, hello.tokens[1]).text)).toBe(
    'An opening bracket. The tokenizer calls every piece of punctuation OP, short for operator, and notes the exact kind: LPAR.',
  );
  expect(plain(explainToken(hello, hello.tokens[1]).more)).toBe('Where: line 1, column 5. tokenize writes this as 1,5-1,6. Bytes: 40.');
  expect(explainGreet('OP', ':').text).toMatch(/^A colon\. After if, for, def and the like, it says the block they control comes next\. Colons have other jobs too, as in dictionaries and slices\. /);
  expect(explainGreet('OP', ',').text).toMatch(/^A comma: it separates things, such as the items of a list, or what a function is given\. /);
});

test('the tokens that mark line ends and indentation explain themselves, in prototype v8’s words', () => {
  expect(explainGreet('NAME', 'def')).toMatchObject({
    title: 'def is a keyword',
    text: 'def is a keyword: a name reserved by Python, which you can’t use for your own things. The tokenizer still calls it a NAME; working out that it’s special comes next.',
  });
  expect(explainGreet('NEWLINE')).toMatchObject({
    title: 'End of line 1',
    text: 'This token comes from byte 10, the invisible newline. It tells Python the line of code is complete.',
    more: 'Where: line 1, column 16. tokenize writes this as 1,16-1,17. Bytes: 10.',
  });
  expect(explainGreet('INDENT')).toMatchObject({
    title: 'A block starts',
    text: 'Line 2 starts with 4 spaces, deeper than the line of code before it, so a block starts here. In Python, indentation is part of the meaning.',
    more: 'Where: line 2, columns 0 to 3. tokenize writes this as 2,0-2,4. Bytes: 32 32 32 32.',
  });
  expect(explainGreet('NL')).toMatchObject({
    title: 'A line with no code',
    text: 'Line 3 has no code on it. Its newline becomes an NL token, not a NEWLINE: it ends a line on the screen, but no line of code. Python ignores it from here on.',
  });
  expect(explainGreet('DEDENT')).toMatchObject({
    title: 'A block ends',
    text: 'An empty token: line 4 starts further left, at column 0, so an indented block has ended. Each block that ends gets its own DEDENT.',
    more: 'Where: line 4, column 0, taking up no space. tokenize writes this as 4,0-4,0.',
  });
  expect(explainGreet('ENDMARKER')).toMatchObject({
    title: 'End of the file',
    text: 'An empty token with no characters at all. Python adds it when the file runs out, so it knows it has seen everything.',
    more: 'Where: line 6, column 0, taking up no space. tokenize writes this as 6,0-6,0.',
  });
  const atEnd = greet.tokens.filter((token) => token.type === 'DEDENT')[1];
  expect(plain(explainToken(greet, atEnd).text)).toBe(
    'An empty token: line 6 doesn’t exist, the file has ended, so an indented block has ended. Each block that ends gets its own DEDENT.',
  );
});

test('INDENT compares with the line of code before it, not a blank or comment line between them', () => {
  const program = 'if x:\n\n    # note\n    pass\n';
  const analysis = analysisOf(program, [], {
    tokens: tokensOf(program, [
      ['NAME', 'if', [1, 0], [1, 2]],
      ['NAME', 'x', [1, 3], [1, 4]],
      ['OP', ':', [1, 4], [1, 5], 'COLON'],
      ['NEWLINE', '\n', [1, 5], [1, 6]],
      ['NL', '\n', [2, 0], [2, 1]],
      ['COMMENT', '# note', [3, 4], [3, 10]],
      ['NL', '\n', [3, 10], [3, 11]],
      ['INDENT', '    ', [4, 0], [4, 4]],
    ], ['if']),
  });

  expect(plain(explainToken(analysis, analysis.tokens[7]).text)).toMatch(/^Line 4 starts with 4 spaces, deeper than the line of code before it,/);
  expect(plain(explainToken(analysis, analysis.tokens[6]).title)).toBe('End of a comment line');
});

test('NL says why a line’s newline ends no line of code: no code, only a comment, or an open bracket', () => {
  const program = 'x = (1,\n  2)\n# note\n';
  const analysis = analysisOf(program, [], {
    tokens: tokensOf(program, [
      ['NAME', 'x', [1, 0], [1, 1]],
      ['OP', '=', [1, 2], [1, 3], 'EQUAL'],
      ['OP', '(', [1, 4], [1, 5], 'LPAR'],
      ['NUMBER', '1', [1, 5], [1, 6]],
      ['OP', ',', [1, 6], [1, 7], 'COMMA'],
      ['NL', '\n', [1, 7], [1, 8]],
      ['NUMBER', '2', [2, 2], [2, 3]],
      ['OP', ')', [2, 3], [2, 4], 'RPAR'],
      ['NEWLINE', '\n', [2, 4], [2, 5]],
      ['COMMENT', '# note', [3, 0], [3, 6]],
      ['NL', '\n', [3, 6], [3, 7]],
      ['ENDMARKER', '', [4, 0], [4, 0]],
    ]),
  });
  const explain = (index: number) => explainToken(analysis, analysis.tokens[index]);

  expect(plain(explain(5).title)).toBe('A line break inside brackets');
  expect(plain(explain(5).text)).toBe('Line 1 ends inside brackets, so the line of code goes on to the next line. Its newline becomes an NL token, not a NEWLINE, and Python ignores it from here on.');
  expect(plain(explain(10).title)).toBe('End of a comment line');
  expect(plain(explain(9).title)).toBe('A comment');
  expect(plain(explain(3).title)).toBe('1 is a number');
  expect(plain(explain(1).text)).toMatch(/^An equals sign\. In a line like x = 1, the name on its left gets the value on its right\. /);
});

test('a token that takes several bytes per character lists every byte, and one over several lines says so', () => {
  const program = 's = """Zoë\nok"""\n';
  const analysis = analysisOf(program, [], {
    tokens: tokensOf(program, [
      ['NAME', 's', [1, 0], [1, 1]],
      ['OP', '=', [1, 2], [1, 3], 'EQUAL'],
      ['STRING', '"""Zoë\nok"""', [1, 4], [2, 5]],
      ['NEWLINE', '\n', [2, 5], [2, 6]],
      ['ENDMARKER', '', [3, 0], [3, 0]],
    ]),
  });

  expect(plain(explainToken(analysis, analysis.tokens[2]).more)).toBe(
    'Where: from line 1 to line 2. tokenize writes this as 1,4-2,5. Bytes: 34 34 34 90 111 195 171 10 111 107 34 34 34.',
  );
});

test('a kind of token with no Template of its own gets a general one, and a value is never read as markup', () => {
  const program = 'f"{x}"\n';
  const analysis = analysisOf(program, [], {
    tokens: tokensOf(program, [
      ['FSTRING_START', 'f"', [1, 0], [1, 2]],
      ['OP', '{', [1, 2], [1, 3], 'LBRACE'],
    ]),
  });

  expect(plain(explainToken(analysis, analysis.tokens[0]).title)).toBe('A token tokenize calls FSTRING_START');
  expect(plain(explainToken(analysis, analysis.tokens[0]).text)).toBe('The tokenizer calls this piece of your code a FSTRING_START.');
  expect(docsOf(explainToken(analysis, analysis.tokens[0]))).toEqual({
    text: 'Read about FSTRING_START in Python’s documentation',
    href: 'https://docs.python.org/3.14/library/token.html#token.FSTRING_START',
  });
  // A token with words of its own needs no link.
  expect(explainToken(analysis, analysis.tokens[1]).docs).toBeUndefined();
  expect(plain(explainToken(analysis, analysis.tokens[1]).title)).toBe('{ is punctuation or an operator');

  const stars = analysisOf('**\n', [], { tokens: tokensOf('**\n', [['OP', '**', [1, 0], [1, 2], 'DOUBLESTAR']]) });
  expect(explainToken(stars, stars.tokens[0]).title).toContainEqual({ text: '**', strong: true });
});
