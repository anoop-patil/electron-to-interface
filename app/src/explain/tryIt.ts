import templateFile from '../../templates/py314.json';
import type { Analysis, AstFact, CommandRun, LineSlot, Templates, TokenFact } from '../generated/analysis';
import { linesOf } from '../zoom/characters';
import { byteFacts, counted, fillString, isAfterLastLine, programFacts, template, tokenFacts, type Span, type TemplateId } from './explain';
import { nodeFacts, nodeKind } from './syntaxTree';

/** Each zoom level's Try it yourself, from the Template file. The build checks it like the Templates (see checkContent.ts). */
const TRY_IT = (templateFile as Templates).tryIt ?? {};

/** The name the Program is saved under for the commands, until file upload (ticket 19) supplies the learner's own. */
export const FILE_NAME = 'program.py';

/** A zoom level's Try it yourself, filled in with the Program's Facts and what its command printed. */
export interface TryItExplanation {
  command: string;
  intro: Span[];
  /** What each part of the command does. */
  parts: { code: string; text: Span[] }[];
  /** What the command printed when the browser's Python ran it on the Program. */
  output: string;
  /** Why the output can be trusted: the browser's Python ran the command. */
  observed: Span[];
  /** Shown in place of the output when the command printed nothing. */
  nothingPrinted: Span[];
  /** Levels 2 to 4: lines of the output, or what they are made from, each with what it means. */
  rows: { printed: string; text: Span[] }[];
  /** How to read the output. */
  read: Span[][];
}

const plain = (spans: Span[]) => spans.map((span) => span.text).join('');

/**
 * The Try it yourself commands for a Program saved as `fileName`, in zoom level order. The browser's Python runs each one
 * on the Program, so the Analysis carries what it printed. The build allows no slot but {file} in a command.
 */
export const tryItCommands = (fileName: string) => Object.values(TRY_IT).map(({ command }) => plain(fillString(command, { file: fileName })));

/** Level 2's rows: the bytes of each line, and what they store. */
function bytesRows(analysis: Analysis) {
  return linesOf(analysis.program).map(({ number, chars }) => {
    const text = chars.map(({ char }) => char).join('').slice(0, -1);
    const content = text.replace(/^ +/, '');
    const indent = text.length - content.length;
    const kind: TemplateId = !text ? 'tryIt.bytesLine.empty' : !content ? 'tryIt.bytesLine.spaces' : indent ? 'tryIt.bytesLine.indented' : 'tryIt.bytesLine.text';
    const facts: Record<LineSlot, string> = { line: String(number), indent: counted(indent, 'space', 'spaces'), text: content };
    return {
      printed: analysis.bytes.filter((byte) => byte.line === number).map((byte) => byte.value).join(', '),
      text: fillString(template(kind, 'line').text, facts),
    };
  });
}

/** Level 1's note on what the output is: the lines the Program printed, or a traceback. */
function level1Notes(analysis: Analysis, { output, exitStatus }: CommandRun): Span[][] {
  const facts = programFacts(analysis);
  if (exitStatus === 0) return output ? [fillString(template('tryIt.level1.printed', 'program').text, facts)] : [];
  // A traceback has a line giving the file and line number where the error happened. Without one, as after
  // sys.exit("bye"), Python printed the output, not the Program, and there is nothing more to say.
  return /^ {2}File "/m.test(output) ? [fillString(template('tryIt.level1.error', 'program').text, facts)] : [];
}

/** Level 2's notes on the numbers only some Programs have: bytes above 127, and tabs. */
function level2Notes(analysis: Analysis): Span[][] {
  const notes: Span[][] = [];
  const multiByte = analysis.bytes.find((byte) => byte.value > 127);
  if (multiByte) notes.push(fillString(template('tryIt.level2.multiByte', 'byte').text, byteFacts(analysis, multiByte)));
  if (analysis.bytes.some((byte) => byte.value === 9)) notes.push(fillString(template('tryIt.level2.tab', 'program').text, programFacts(analysis)));
  return notes;
}

/** One line of `python -m tokenize`'s output: where the token starts and ends, its type, and its text as repr shows it. */
const TOKENIZE_LINE = /^(\d+),(\d+)-(\d+),(\d+):\s+([A-Z_]+)\s+(.*?)\s*$/;

/** The Template that explains a token's line of tokenize's output: the tokens that mark line ends and indentation, or the position of the first other token. */
function tokenRowTemplate(analysis: Analysis, token: TokenFact): TemplateId {
  switch (token.type) {
    case 'NEWLINE': return 'tryIt.tokenRow.newline';
    case 'INDENT': return 'tryIt.tokenRow.indent';
    case 'NL': return 'tryIt.tokenRow.nl';
    case 'DEDENT': return isAfterLastLine(analysis, token) ? 'tryIt.tokenRow.dedentAtEnd' : 'tryIt.tokenRow.dedent';
    case 'ENDMARKER': return 'tryIt.tokenRow.endmarker';
    default: return 'tryIt.tokenRow.position';
  }
}

/**
 * tokenize's output, line by line: its ENCODING line, then one line for each of the Program's tokens. Null if tokenize
 * stopped with an error, or its lines don't match the tokens, in order.
 */
function tokenizeLines(analysis: Analysis, { output, exitStatus }: CommandRun) {
  const lines = output.split('\n').filter(Boolean).map((line) => TOKENIZE_LINE.exec(line));
  const matches = lines.length === analysis.tokens.length + 1 && analysis.tokens.every(({ type, start, end }, index) => {
    const line = lines[index + 1];
    return line?.slice(1, 6).join(' ') === `${start.line} ${start.column} ${end.line} ${end.column} ${type}`;
  });
  return exitStatus === 0 && matches && lines[0] ? (lines as RegExpExecArray[]) : null;
}

/** Level 3's rows: the ENCODING line, then the first line of each kind the reading notes explain, as tokenize printed it with its runs of spaces shortened. */
function tokenRows(analysis: Analysis, result: CommandRun) {
  const lines = tokenizeLines(analysis, result);
  if (!lines) return [];
  const printed = ([, line, column, endLine, endColumn, type, text]: RegExpExecArray) => `${line},${column}-${endLine},${endColumn}:  ${type}  ${text}`;
  const rows = [{ printed: printed(lines[0]), text: fillString(template('tryIt.tokenRow.encoding', 'program').text, programFacts(analysis)) }];
  const explained = new Set<string>();
  analysis.tokens.forEach((token, index) => {
    const id = tokenRowTemplate(analysis, token);
    // One row for each kind: every token type that marks line ends or indentation, with both kinds of DEDENT as one, and one position.
    const rowKind = id === 'tryIt.tokenRow.position' ? id : token.type;
    if (explained.has(rowKind)) return;
    explained.add(rowKind);
    rows.push({ printed: printed(lines[index + 1]), text: fillString(template(id, 'token').text, tokenFacts(analysis, token)) });
  });
  return rows;
}

/** Level 3's note: the output lists the same tokens as the chips, when it does. */
const level3Notes = (analysis: Analysis, result: CommandRun) =>
  tokenizeLines(analysis, result) ? [fillString(template('tryIt.level3.tokens', 'program').text, programFacts(analysis))] : [];

/** The Template that explains a box's line of `python -m ast`'s output, by the Template that explains the box, for the kinds of box level 4's reading tab explains. */
const AST_ROWS: Partial<Record<TemplateId, TemplateId>> = {
  'node.module': 'tryIt.astRow.module',
  'node.functionDef': 'tryIt.astRow.functionDef',
  'node.argOnly': 'tryIt.astRow.argOnly',
  'node.arg': 'tryIt.astRow.arg',
  'node.for': 'tryIt.astRow.for',
  'node.expr': 'tryIt.astRow.expr',
  'node.call': 'tryIt.astRow.call',
  'node.name': 'tryIt.astRow.nameLoad',
  'node.nameStore': 'tryIt.astRow.nameStore',
  'node.nameStoreLoop': 'tryIt.astRow.nameStore',
  'node.constantText': 'tryIt.astRow.constant',
  'node.constant': 'tryIt.astRow.constant',
};

/** A box as `python -m ast` starts it, with the boxes inside it shortened: Call(func=…, args=[…]). */
const astSummary = ({ type, fields }: AstFact) =>
  `${type}(${fields.map((field) => `${field.name}=${'value' in field ? field.value : field.list ? '[…]' : '…'}`).join(', ')})`;

/** python -m ast printed the tree, rather than stopping at a syntax error. */
const printedTree = (analysis: Analysis, result: CommandRun) => result.exitStatus === 0 && analysis.ast.length > 0;

/** Level 4's rows: the first box of each kind the reading tab explains, in the order python -m ast prints them. */
function astRows(analysis: Analysis, result: CommandRun) {
  if (!printedTree(analysis, result)) return [];
  const explained = new Set<TemplateId>();
  return analysis.ast.flatMap((node) => {
    const id = AST_ROWS[nodeKind(analysis, node)];
    if (!id || explained.has(id)) return [];
    explained.add(id);
    return [{ printed: astSummary(node), text: fillString(template(id, 'node').text, nodeFacts(analysis, node)) }];
  });
}

/** Level 4's notes: how the output's boxes match the boxes at this zoom level, when python -m ast printed the tree. */
const level4Notes = (analysis: Analysis, result: CommandRun) =>
  printedTree(analysis, result) ? (['tryIt.level4.boxes', 'tryIt.level4.indent'] as const).map((id) => fillString(template(id, 'program').text, programFacts(analysis))) : [];

/** The notes on reading a level's output that the page works out from the Program and what its command printed. */
const NOTES: Record<number, (analysis: Analysis, result: CommandRun) => Span[][]> = { 1: level1Notes, 2: level2Notes, 3: level3Notes, 4: level4Notes };

/** The rows of a level's reading tab, worked out from the Program and what its command printed. */
const ROWS: Record<number, (analysis: Analysis, result: CommandRun) => TryItExplanation['rows']> = { 2: bytesRows, 3: tokenRows, 4: astRows };

/** The Try it yourself of a zoom level, or null if the level has none yet. */
export function explainTryIt(level: number, analysis: Analysis): TryItExplanation | null {
  const tryIt = TRY_IT[level];
  if (!tryIt) return null;
  const facts = programFacts(analysis);
  const fill = (string: string) => fillString(string, facts);
  const command = plain(fill(tryIt.command));
  const result = analysis.commands.find((other) => other.command === command);
  if (!result) throw new Error(`The Analysis has no output for ${command}`);
  const notes = NOTES[level]?.(analysis, result) ?? [];
  return {
    command,
    intro: fill(tryIt.intro),
    parts: tryIt.parts.map((part) => ({ code: plain(fill(part.code)), text: fill(part.text) })),
    output: result.output,
    observed: fill(template('tryIt.observed', 'program').text),
    nothingPrinted: fill(template('tryIt.nothingPrinted', 'program').text),
    rows: ROWS[level]?.(analysis, result) ?? [],
    read: [...notes, ...tryIt.read.map(fill)],
  };
}
