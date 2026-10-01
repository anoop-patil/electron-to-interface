import templateFile from '../../templates/py314.json';
import type { Analysis, ByteFact, ByteSlot, ProgramSlot, Template, Templates } from '../generated/analysis';
import { bitsOf } from '../concepts/bits';
import { charLabel, linesOf } from '../zoom/characters';

/** The Templates for Python 3.14. The build checks them against the schema, the slots and the Concept cards (see checkContent.ts). */
const TEMPLATES = (templateFile as Templates).templates;

export type TemplateId = keyof typeof templateFile.templates;

/** A run of an Explanation's text: bold, or a word with a Concept card, or neither. */
export interface Span {
  text: string;
  strong?: boolean;
  concept?: string;
}

/** A Template filled in with the real Facts of the learner's Program. */
export interface Explanation {
  title?: Span[];
  text: Span[];
  /** The technical term, shown once in small print. */
  term?: Span[];
}

/** `**`, `[[concept|words]]` or `{slot}`: the markup a Template's strings can hold. */
const MARKUP = /(\*\*|\[\[[a-z0-9]+\|[^\]]+\]\]|\{[A-Za-z]+\})/;

/** Fills in one Template string. Markup is read before the values go in, so a `*` in the Program stays a `*`. */
export function fillString(string: string, facts: Record<string, string> = {}): Span[] {
  const spans: Span[] = [];
  let strong = false;
  for (const part of string.split(MARKUP)) {
    if (part === '**') strong = !strong;
    else if (part.startsWith('[[')) {
      const [concept, text] = part.slice(2, -2).split('|');
      spans.push({ text, concept, ...(strong && { strong }) });
    } else if (part.startsWith('{')) {
      const value = facts[part.slice(1, -1)];
      if (value === undefined) throw new Error(`No Fact fills ${part}`);
      spans.push({ text: value, ...(strong && { strong }) });
    } else if (part) spans.push({ text: part, ...(strong && { strong }) });
  }
  return spans;
}

/** Text with bold words and words with a Concept card, but no slots, such as a Concept card's own text. */
export const textSpans = (string: string) => fillString(string);

function fill(template: Template, facts: Record<string, string>): Explanation {
  return {
    ...(template.title && { title: fillString(template.title, facts) }),
    text: fillString(template.text, facts),
    ...(template.term && { term: fillString(template.term, facts) }),
  };
}

export const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function programFacts(analysis: Analysis): Record<ProgramSlot, string> {
  return {
    lines: counted(linesOf(analysis.program).length, 'line', 'lines'),
    characters: counted(Array.from(analysis.program).length, 'character', 'characters'),
    bytes: counted(analysis.bytes.length, 'byte', 'bytes'),
    file: analysis.fileName,
  };
}

export function template(id: TemplateId, subject: Template['subject']) {
  const found = TEMPLATES[id];
  if (found.subject !== subject) throw new Error(`Template ${id} explains a ${found.subject}, not a ${subject}`);
  return found;
}

/** A Template about the whole Program, such as a zoom level's introduction, filled in with its Facts. */
export const explainProgram = (id: TemplateId, analysis: Analysis) => fill(template(id, 'program'), programFacts(analysis));

const hex4 = (codePoint: number) => `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
const PLACES = ['first', 'second', 'third', 'fourth'];

/** What a byte's Template needs to know: its character, that character's bytes, and its line's indentation. */
function aboutByte(analysis: Analysis, byte: ByteFact) {
  const line = linesOf(analysis.program)[byte.line - 1].chars;
  const firstNonSpace = line.find(({ char }) => char !== ' ')!;
  return {
    number: analysis.bytes.findIndex((other) => other.id === byte.id) + 1,
    char: Array.from(analysis.program)[byte.charIndex],
    charBytes: analysis.bytes.filter((other) => other.charIndex === byte.charIndex),
    // A line of nothing but spaces isn't indented: Python skips it.
    indent: firstNonSpace.char === '\n' ? 0 : firstNonSpace.index - line[0].index,
    isIndent: byte.charIndex < firstNonSpace.index && firstNonSpace.char !== '\n',
  };
}

export function byteFacts(analysis: Analysis, byte: ByteFact): Record<ByteSlot, string> {
  const { number, char, charBytes, indent } = aboutByte(analysis, byte);
  return {
    number: String(number),
    count: String(analysis.bytes.length),
    value: String(byte.value),
    char: charLabel(char),
    line: String(byte.line),
    indent: counted(indent, 'space', 'spaces'),
    codePoint: hex4(char.codePointAt(0)!),
    charSize: counted(charBytes.length, 'byte', 'bytes'),
    charBytes: charBytes.map((other) => other.value).join(' '),
    placeInChar: PLACES[charBytes.findIndex((other) => other.id === byte.id)],
    bits: bitsOf(byte.value).pattern,
  };
}

/** Which kind of byte this is, which picks its Template. */
function byteKind(analysis: Analysis, byte: ByteFact): TemplateId {
  const { char, charBytes, indent, isIndent } = aboutByte(analysis, byte);
  if (charBytes.length > 1) return 'byte.multiByte';
  if (char === '\n') return 'byte.newline';
  if (char === '"') return 'byte.quote';
  if (char !== ' ') return 'byte.character';
  if (!isIndent) return 'byte.space';
  return indent === 1 ? 'byte.indentOneSpace' : 'byte.indent';
}

/** The Explanation of one byte, from the Template for its kind: a newline, an indent, a quote mark, and so on. */
export const explainByte = (analysis: Analysis, byte: ByteFact) => fill(template(byteKind(analysis, byte), 'byte'), byteFacts(analysis, byte));

/** Zoom level 2's panel How the number N is stored: what a byte's 8 bits are, and the selected byte's pattern. */
export function explainBits(analysis: Analysis, byte: ByteFact) {
  const facts = byteFacts(analysis, byte);
  const { title, text } = fill(template('byte.bits', 'byte'), facts);
  const multiByte = aboutByte(analysis, byte).charBytes.length > 1;
  const pattern = fill(template(multiByte ? 'byte.bitsPatternMultiByte' : 'byte.bitsPattern', 'byte'), facts).text;
  return { title: title!, text, pattern };
}
