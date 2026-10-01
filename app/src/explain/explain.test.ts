import { expect, test } from 'vitest';
import { analysisOf } from '../testAnalysis';
import { explainBits, explainByte, explainProgram, type Span } from './explain';

const plain = (spans: Span[] | undefined) => spans?.map((span) => span.text).join('');

test('the level 1 and 2 text counts the lines, characters and bytes of the Program it explains', () => {
  const ada = analysisOf('name = "Ada"\nfor i in range(2):\n    print(name, i)\n');
  const zoe = analysisOf('name = "Zoë"\nprint(name)\n');

  expect(plain(explainProgram('level1.intro', ada).text)).toBe(
    'You typed 3 lines and clicked Run. At this level your program is still just text, as you wrote it. Your computer stores it as bytes, which the next zoom level shows. Highlighted words, like that one, open a short explanation.',
  );
  expect(plain(explainProgram('level1.size', ada).text)).toBe(
    'Your program has 3 lines and 51 characters, counting the spaces and the invisible newline at the end of each line.',
  );
  expect(plain(explainProgram('level2.caption', ada).text)).toMatch(/^Your program in bytes: 51 bytes, shown line by line, the same bytes a file of it would hold\./);

  // ë is one character but two bytes.
  expect(plain(explainProgram('level1.size', zoe).text)).toMatch(/has 2 lines and 25 characters,/);
  expect(plain(explainProgram('level2.caption', zoe).text)).toMatch(/: 26 bytes, shown/);
});

test('a byte explains the character it stores, in prototype v8’s words', () => {
  const hello = analysisOf('print("Hello World!")\n');

  const p = explainByte(hello, hello.bytes[0]);
  expect(plain(p.title)).toBe('Byte 1 of 22: p is stored as 112');
  expect(plain(p.text)).toBe(
    'Every character has an agreed number. p is 112. This agreement is called UTF-8, and for English letters and common symbols, each character takes exactly one byte.',
  );
  expect(p.text).toContainEqual({ text: 'p', strong: true });
  expect(p.text).toContainEqual({ text: 'UTF-8', concept: 'utf8' });
  expect(plain(p.term)).toBe('code point U+0070');
});

test('newlines, indentation, spaces and quote marks each have their own words', () => {
  const greet = analysisOf('def greet(name):\n    print("Hi", name)\n');
  const explain = (index: number) => plain(explainByte(greet, greet.bytes[index]).text);

  expect(explain(16)).toBe(
    'The newline at the end of line 1. You can’t see it, but it is stored as number 10, and it tells Python the line is over.',
  );
  expect(explain(18)).toBe(
    'One of the 4 spaces that indent line 2. Indentation is stored like any other character, as number 32, and for Python it matters: it says which lines belong together.',
  );
  expect(explain(3)).toBe('A space, stored as number 32.');
  expect(explain(27)).toBe(
    'A quote mark is stored like any other character. Python uses the pair of them to find where a piece of text starts and ends.',
  );
  expect(plain(explainByte(greet, greet.bytes[16]).title)).toBe('Byte 17 of 39: ↵ is stored as 10');
  expect(plain(explainByte(greet, greet.bytes[16]).term)).toBe('line feed (LF), code point U+000A');
});

test('a * in the Program is shown as itself, not read as bold', () => {
  const times = analysisOf('x = 2 * 3\n');

  const { title } = explainByte(times, times.bytes[6]);
  expect(plain(title)).toBe('Byte 7 of 10: * is stored as 42');
  expect(title?.filter((span) => span.strong)).toEqual([{ text: '*', strong: true }]);
});

test('a line indented by one space, and a blank line of spaces, aren’t mistaken for 4-space indentation', () => {
  const program = analysisOf('if x:\n print(x)\n  \n');

  expect(plain(explainByte(program, program.bytes[6]).text)).toMatch(/^The space that indents line 2\./);
  expect(plain(explainByte(program, program.bytes[16]).text)).toBe('A space, stored as number 32.');
});

test('a character that takes several bytes says which of its bytes this is', () => {
  const zoe = analysisOf('s = "ë"\n');
  const second = explainByte(zoe, zoe.bytes[6]);

  expect(plain(second.title)).toBe('Byte 7 of 9: ë is stored as 195 171');
  expect(plain(second.text)).toBe(
    'Every character has an agreed number, but only English letters and common symbols fit in one byte. UTF-8 stores ë as 2 bytes: 195 171. This byte is the second of them.',
  );
  expect(plain(second.term)).toBe('code point U+00EB');
});

test('a one-line Program is 1 line, not 1 lines', () => {
  expect(plain(explainProgram('level1.caption', analysisOf('print("Hello World!")\n')).text)).toBe('Your whole program: 1 line.');
});

test('level 2’s panel works out how the selected byte is stored as 8 bits', () => {
  const hello = analysisOf('print("Hello World!")\n');
  const p = explainBits(hello, hello.bytes[0]);

  expect(plain(p.title)).toBe('How the number 112 is stored');
  expect(plain(p.text)).toBe(
    'A byte is 8 bits: 8 tiny on/off switches. Each switch has a value, shown under it. Add up the values of the switches that are on, and you get the number. This way of counting is called binary.',
  );
  expect(p.text).toContainEqual({ text: 'bits', concept: 'bit' });
  expect(plain(p.pattern)).toBe('So p is stored as the pattern 01110000.');
  expect(plain(explainBits(hello, hello.bytes[21]).pattern)).toBe('So ↵ is stored as the pattern 00001010.');
});

test('the bits of one byte of a longer character say which character they belong to', () => {
  const zoe = analysisOf('s = "ë"\n');

  expect(plain(explainBits(zoe, zoe.bytes[6]).pattern)).toBe('So the second byte of ë is stored as the pattern 10101011.');
});
