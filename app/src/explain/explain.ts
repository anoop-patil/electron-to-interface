import templateFile from '../../templates/py314.json';
import type { Analysis, ByteFact, ByteSlot, ProgramSlot, Template, Templates, TokenFact, TokenSlot } from '../generated/analysis';
import { bitsOf } from '../concepts/bits';
import { charLabel, linesOf } from '../zoom/characters';
import { codeName } from './bytecode';
import { sampleFor } from './reference';
import { syntaxErrorOf, whereStopped } from './stopped';

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
  /** A second paragraph, such as where a token sits and its bytes. */
  more?: Span[];
  /** For an element with no Template of its own: a link to the part of Python's documentation about its kind. */
  docs?: { text: Span[]; href: string };
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

/** Fills in a link's address. Each value is encoded, so a Fact can't change where the link leads. */
const fillAddress = (href: string, facts: Record<string, string>) =>
  href.replace(/\{([A-Za-z]+)\}/g, (slot, name: string) => {
    if (facts[name] === undefined) throw new Error(`No Fact fills ${slot}`);
    return encodeURIComponent(facts[name]);
  });

export function fill(template: Template, facts: Record<string, string>): Explanation {
  return {
    ...(template.title && { title: fillString(template.title, facts) }),
    text: fillString(template.text, facts),
    ...(template.term && { term: fillString(template.term, facts) }),
    ...(template.docs && { docs: { text: fillString(template.docs.text, facts), href: fillAddress(template.docs.href, facts) } }),
  };
}

export const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function programFacts(analysis: Analysis): Record<ProgramSlot, string> {
  const sample = sampleFor(analysis);
  return {
    lines: counted(linesOf(analysis.program).length, 'line', 'lines'),
    characters: counted(Array.from(analysis.program).length, 'character', 'characters'),
    bytes: counted(analysis.bytes.length, 'byte', 'bytes'),
    file: analysis.fileName,
    tokens: counted(analysis.tokens.length, 'token', 'tokens'),
    // Only filled in where the page knows tokenize named an encoding.
    encoding: analysis.encoding ?? '',
    boxes: counted(analysis.ast.length, 'box', 'boxes'),
    lists: listsOf(analysis),
    steps: counted(analysis.bytecode.reduce((count, code) => count + code.steps.length, 0), 'step', 'steps'),
    ran: counted(analysis.runs.length, 'step run', 'step runs'),
    sample: sample.name,
    platform: sample.samples['7'].platform,
    stoppedAt: whereStopped(analysis),
  };
}

/** Names in a sentence: greet, add and Point. */
export const joined = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The lists of steps the compiler made, one for each code object, in words. */
function listsOf(analysis: Analysis) {
  const others = analysis.bytecode.slice(1).map(codeName);
  if (others.length === 0) return 'one list, for your program';
  return others.length === 1 ? `one for your program, and one for ${others[0]}` : `one for your program, and one each for ${joined(others)}`;
}

/** Whether a Template with this ID exists, for Templates looked up by the kind of thing they explain, such as field.call.args. */
export const hasTemplate = (id: string): id is TemplateId => id in TEMPLATES;

export function template(id: TemplateId, subject: Template['subject']) {
  const found = TEMPLATES[id];
  if (found.subject !== subject) throw new Error(`Template ${id} explains a ${found.subject}, not a ${subject}`);
  return found;
}

/** A Template about the whole Program, such as a zoom level's introduction, filled in with its Facts. */
export const explainProgram = (id: TemplateId, analysis: Analysis) => fill(template(id, 'program'), programFacts(analysis));

/** The Template that introduces each zoom level. */
const INTROS: Record<number, TemplateId> = { 1: 'level1.intro', 2: 'level2.intro', 3: 'level3.intro', 4: 'level4.intro', 5: 'level5.intro', 6: 'level6.intro', 7: 'level7.intro', 8: 'level8.intro', 9: 'level9.intro' };

/**
 * A zoom level's introduction. Level 1's says the learner typed the Program and clicked Run, unless it is an Example,
 * which Python ran when the site was built. For a Program with a syntax error, which Python never ran, level 1's and
 * level 5's say so.
 */
export function levelIntro(level: number, analysis: Analysis) {
  const stopped = syntaxErrorOf(analysis) !== null;
  let id: TemplateId | undefined = INTROS[level];
  if (level === 1 && analysis.example) id = stopped ? 'level1.introBuiltSyntaxError' : 'level1.introBuilt';
  if (level === 5 && stopped) id = 'level5.introNoSteps';
  return id ? explainProgram(id, analysis) : null;
}

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

/** What an INDENT is made of: 4 spaces, 1 tab, or 5 spaces and tabs. */
export function indentOf(text: string) {
  if (/^ +$/.test(text)) return counted(text.length, 'space', 'spaces');
  if (/^	+$/.test(text)) return counted(text.length, 'tab', 'tabs');
  return `${text.length} spaces and tabs`;
}

/** The columns a token takes up on its line, in words. Its end is the first column after it. */
function columnsOf({ start, end }: TokenFact) {
  if (end.line !== start.line || end.column - start.column === 1) return `column ${start.column}`;
  if (end.column === start.column) return `column ${start.column}, taking up no space`;
  return `columns ${start.column} to ${end.column - 1}`;
}

export function tokenFacts(analysis: Analysis, token: TokenFact): Record<TokenSlot, string> {
  const { start, end, span } = token;
  return {
    text: token.text,
    type: token.type,
    exactType: token.exactType,
    line: String(start.line),
    endLine: String(end.line),
    column: String(start.column),
    columns: columnsOf(token),
    position: `${start.line},${start.column}-${end.line},${end.column}`,
    bytes: analysis.bytes.slice(span.start, span.end).map((byte) => byte.value).join(' '),
    indent: indentOf(token.text),
  };
}

/** The Templates for punctuation that has words of its own, by the exact kind tokenize names. */
const PUNCTUATION: Record<string, TemplateId> = {
  LPAR: 'token.openBracket',
  RPAR: 'token.closeBracket',
  LSQB: 'token.openSquare',
  RSQB: 'token.closeSquare',
  COLON: 'token.colon',
  COMMA: 'token.comma',
  EQUAL: 'token.equals',
};

const TOKEN_TEMPLATES: Record<string, TemplateId> = {
  NUMBER: 'token.number',
  STRING: 'token.string',
  COMMENT: 'token.comment',
  NEWLINE: 'token.newline',
  INDENT: 'token.indent',
  ENDMARKER: 'token.endmarker',
};

/** A DEDENT or ENDMARKER that tokenize places on the line after the Program's last, because the file has ended. */
export const isAfterLastLine = (analysis: Analysis, token: TokenFact) => token.start.line > linesOf(analysis.program).length;

/** Which kind of token this is, which picks its Template. A kind with no Template of its own gets a general one. */
function tokenKind(analysis: Analysis, token: TokenFact): TemplateId {
  const lines = linesOf(analysis.program);
  if (token.type === 'NAME') return token.keyword ? 'token.keyword' : 'token.name';
  if (token.type === 'OP') return PUNCTUATION[token.exactType] ?? 'token.op';
  if (token.type === 'DEDENT') return isAfterLastLine(analysis, token) ? 'token.dedentAtEnd' : 'token.dedent';
  if (token.type === 'NL') {
    // A newline that ends no line of code: the line has no code, holds only a comment, or ends inside brackets.
    const line = lines[token.start.line - 1].chars.map(({ char }) => char).join('').trim();
    return !line ? 'token.noCode' : line.startsWith('#') ? 'token.commentLine' : 'token.insideBrackets';
  }
  return TOKEN_TEMPLATES[token.type] ?? 'token.other';
}

/** The Explanation of one token, from the Template for its kind, then where it sits and its bytes. */
export function explainToken(analysis: Analysis, token: TokenFact): Explanation {
  const facts = tokenFacts(analysis, token);
  const where = template(token.end.line === token.start.line ? 'token.where' : 'token.whereLines', 'token');
  const more = fillString(where.text, facts);
  if (facts.bytes) more.push({ text: ' ' }, ...fillString(template('token.bytes', 'token').text, facts));
  return { ...fill(template(tokenKind(analysis, token), 'token'), facts), more };
}
