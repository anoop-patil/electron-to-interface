import templateFile from '../../templates/py314.json';
import type { Analysis, AstFact, CommandRun, LineSlot, Templates, TokenFact } from '../generated/analysis';
import { linesOf } from '../zoom/characters';
import { byteFacts, counted, fillString, isAfterLastLine, programFacts, template, tokenFacts, type Span, type TemplateId } from './explain';
import { allSteps, stepsOf, type StepInCode } from './bytecode';
import { commandFor } from './commands';
import { level6 } from './interpreter';
import { piecesOutput, straceRows } from './operatingSystem';
import { sampleFor } from './reference';
import { stepFacts } from './steps';
import { nodeFacts, nodeKind } from './syntaxTree';

/** Each zoom level's Try it yourself, from the Template file. The build checks it like the Templates (see checkContent.ts). */
const TRY_IT = (templateFile as Templates).tryIt ?? {};

/** A zoom level's Try it yourself, filled in with the Program's Facts and what its command printed. */
export interface TryItExplanation {
  /** The command, or null for a Try it yourself with none, such as level 9's, which has only its intro. */
  command: string | null;
  /** What the collapsed row says in place of a command. */
  summary: Span[] | null;
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
  /** Level 6: the lines of C its zoom level shows for the selected step run, on GitHub. */
  links: { text: string; href: string }[];
  linksIntro: Span[];
  /** Levels 7 and 8: the same command run natively on the test machine for an Example, which a browser can't do. */
  sample: { command: string; output: string; caption: Span[] } | null;
}

const plain = (spans: Span[]) => spans.map((span) => span.text).join('');

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

/** One step as `python -m dis` prints it: its line, if a new one starts there, a label, if steps jump to it, the opname, the argument and what it means. */
const DIS_LINE = /^\s*(\d+)?\s+(L\d+:)?\s*([A-Z][A-Z0-9_]*)(?:\s+(\d+))?(?:\s+\((.*)\))?\s*$/;

/**
 * dis's lines, each paired with the step it shows, in the order dis prints the code objects, which is the order the
 * Analysis lists them. Null if dis stopped with an error, or its lines don't match the steps, in order.
 */
function disLines(analysis: Analysis, { output, exitStatus }: CommandRun) {
  const lines = output.split('\n');
  const stepLines = lines.map((line) => DIS_LINE.exec(line)).filter((match) => match !== null);
  const steps = allSteps(analysis);
  const matches = stepLines.length === steps.length && stepLines.every((match, index) => match[3] === steps[index].step.opname);
  return exitStatus === 0 && matches ? { lines, steps: stepLines.map((match, index) => ({ match, step: steps[index] })) } : null;
}

/** The Templates for the first step of each kind level 5's reading tab explains, by what picks it. */
const DIS_ROWS: { id: TemplateId; picks(step: StepInCode): boolean }[] = [
  { id: 'tryIt.disRow.loadConst', picks: ({ step }) => step.opname === 'LOAD_CONST' && !step.argrepr.startsWith('<code object') },
  { id: 'tryIt.disRow.loadGlobalNull', picks: ({ step }) => step.opname === 'LOAD_GLOBAL' && ((step.arg ?? 0) & 1) === 1 },
  { id: 'tryIt.disRow.loadFast', picks: ({ step }) => /^LOAD_FAST(_BORROW|_CHECK)?$/.test(step.opname) },
];

/** Level 5's rows: the line numbers, the labels, each code object's heading, and the first step of each kind the tab explains, in the order dis prints them. */
function disRows(analysis: Analysis, result: CommandRun) {
  const found = disLines(analysis, result);
  if (!found) return [];
  const facts = programFacts(analysis);
  const numbers = [...new Set(found.steps.flatMap(({ match }) => (match[1] ? [match[1]] : [])))];
  const labels = found.steps.flatMap(({ match }) => (match[2] ? [match[2]] : []));
  const rows: { at: number; printed: string; text: Span[] }[] = [];
  rows.push({ at: -2, printed: `${numbers.join(', ')} (far left)`, text: fillString(template(numbers.includes('0') ? 'tryIt.disRow.lines' : 'tryIt.disRow.linesNoSetup', 'program').text, facts) });
  if (labels.length) rows.push({ at: -1, printed: labels.length > 1 ? `${labels[0]} … ${labels.at(-1)}` : labels[0], text: fillString(template('tryIt.disRow.labels', 'program').text, facts) });
  const heading = found.lines.findIndex((line) => line.startsWith('Disassembly of <code object '));
  if (heading >= 0 && analysis.bytecode.length > 1) {
    const [code] = stepsOf(analysis, 1);
    rows.push({ at: heading, printed: found.lines[heading].replace(/ at 0x[0-9a-f]+, .*>:$/, ' at 0x…>'), text: fillString(template('tryIt.disRow.code', 'step').text, stepFacts(analysis, code, null)) });
  }
  for (const { id, picks } of DIS_ROWS) {
    const first = found.steps.find(({ step }) => picks(step));
    if (!first) continue;
    const [, , , opname, arg, argrepr] = first.match;
    rows.push({
      at: found.lines.indexOf(first.match.input),
      printed: `${opname}${arg ? ` ${arg}` : ''}${argrepr ? ` (${argrepr})` : ''}`,
      text: fillString(template(id, 'step').text, stepFacts(analysis, first.step, null)),
    });
  }
  return rows.sort((one, other) => one.at - other.at).map(({ printed, text }) => ({ printed, text }));
}

/**
 * Level 6's rows: the first step of each kind that Python rewrote, as dis printed it after the run. dis prints the
 * Program's own output first, so its last lines are the steps; each must be the step's opname or a form of it.
 */
function adaptiveRows(analysis: Analysis, { output, exitStatus }: CommandRun) {
  const steps = allSteps(analysis);
  const lines = output.split('\n').map((line) => DIS_LINE.exec(line)).filter((match) => match !== null).slice(-steps.length);
  const forms = (match: RegExpExecArray, { step }: StepInCode) => match[3] === step.opname || match[3].startsWith(`${step.opname}_`);
  if (exitStatus !== 0 || steps.length === 0 || lines.length !== steps.length || !lines.every((match, at) => forms(match, steps[at]))) return [];
  const explained = new Set<string>();
  return lines.flatMap((match, at) => {
    const [, , , form, arg, argrepr] = match;
    const found = steps[at];
    const rewrite = `${found.step.opname} ${form}`;
    if (form === found.step.opname || explained.has(rewrite)) return [];
    explained.add(rewrite);
    const shown = argrepr?.replace(/^<code object (\S+) at 0x[0-9a-fA-F]+, .*>$/, '<code object $1 at 0x…>');
    return [{ printed: `${form}${arg ? ` ${arg}` : ''}${shown ? ` (${shown})` : ''}`, text: fillString(template('tryIt.adaptiveRow', 'step').text, stepFacts(analysis, found, null)) }];
  });
}

/** The seconds level 7's command printed on its last line, after the Program's own output, or null if it stopped with an error. */
function secondsOf({ output, exitStatus }: CommandRun) {
  const lines = output.replace(/\n$/, '').split('\n');
  const last = lines.at(-1) ?? '';
  return exitStatus === 0 && /^\d+(\.\d+)?(e-\d+)?$/.test(last) ? { printed: lines.slice(0, -1), seconds: last } : null;
}

/** Level 7's rows: the Program's own output, if it printed any, then how long it took. */
function timeRows(analysis: Analysis, result: CommandRun) {
  const found = secondsOf(result);
  if (!found) return [];
  const facts = programFacts(analysis);
  const row = (printed: string, id: TemplateId) => ({ printed, text: fillString(template(id, 'program').text, facts) });
  const shown = found.printed.length > 3 ? [...found.printed.slice(0, 3), '…'] : found.printed;
  return [...(shown.length > 0 ? [row(shown.join('\n'), 'tryIt.timeRow.output')] : []), row(found.seconds, 'tryIt.timeRow.seconds')];
}

/**
 * Level 7's notes: Python measured the time on WebAssembly, in the browser, where a time of 0 is its clock's
 * coarseness, or, for an Example, when the site was built.
 */
function level7Notes(analysis: Analysis, result: CommandRun): Span[][] {
  const facts = programFacts(analysis);
  const zero = Number(secondsOf(result)?.seconds) === 0;
  const ids = analysis.example ? (['tryIt.level7.built'] as const) : (['tryIt.level7.browser', ...(zero ? ['tryIt.level7.zero' as const] : [])] as const);
  return ids.map((id) => fillString(template(id, 'program').text, facts));
}

/** The notes on reading a level's output that the page works out from the Program and what its command printed. */
const NOTES: Record<number, (analysis: Analysis, result: CommandRun) => Span[][]> = { 1: level1Notes, 2: level2Notes, 3: level3Notes, 4: level4Notes, 7: level7Notes };

/** The rows of a level's reading tab, worked out from the Program and what its command printed. */
const ROWS: Record<number, (analysis: Analysis, result: CommandRun) => TryItExplanation['rows']> = { 2: bytesRows, 3: tokenRows, 4: astRows, 5: disRows, 6: adaptiveRows, 7: timeRows };

/** Level 7 or 8's sample: its command, run natively for the Program if it is an Example, else for greet.py. */
function sampleOf(analysis: Analysis, level: '7' | '8'): TryItExplanation['sample'] {
  const { command, output } = sampleFor(analysis).samples[level];
  return { command, output, caption: fillString(template('tryIt.sample', 'program').text, programFacts(analysis)) };
}

/** Level 6's links: each handler's lines of C that the zoom level shows for the selected step run, on GitHub. */
const linksOf = (analysis: Analysis, selection: string | null) =>
  (level6(analysis, selection)?.handlers ?? []).flatMap(({ handler, links }) => links.map(({ where, href }) => ({ text: `${handler}: ${where}`, href })));

/** What the What you’ll see and How to read it tabs show: the output, why it can be trusted, its rows and the notes worked out from it. */
interface Shown {
  output: string;
  observed: TemplateId;
  rows: TryItExplanation['rows'];
  notes: Span[][];
}

/** A command the browser's Python ran on the Program, or, for an Example, ran when the site was built: what it printed, and what the page works out from that. */
function ranInBrowser(level: number, analysis: Analysis, command: string): Shown {
  const result = analysis.commands.find((other) => other.command === command);
  if (!result) throw new Error(`The Analysis has no output for ${command}`);
  return { output: result.output, observed: analysis.example ? 'tryIt.built' : 'tryIt.observed', rows: ROWS[level]?.(analysis, result) ?? [], notes: NOTES[level]?.(analysis, result) ?? [] };
}

/** The exit status of `python FILE`, level 1's command, or what an error would give, if the Analysis has no record of it. */
function exitStatusOf(analysis: Analysis) {
  const run = analysis.commands.find((other) => other.command === commandFor(TRY_IT[1].command!, analysis.fileName));
  return run?.exitStatus ?? (analysis.error ? 1 : 0);
}

/**
 * What the browser observed in place of a command it can't run, by zoom level. Level 8: the pieces the Program handed
 * to sys.stdout and sys.stderr, in place of strace's list of the write calls they become.
 */
const OBSERVED_INSTEAD: Record<number, (analysis: Analysis) => Shown> = {
  8: (analysis) => ({
    output: piecesOutput(analysis),
    observed: analysis.example ? 'tryIt.level8.built' : 'tryIt.level8.observed',
    rows: straceRows(analysis, exitStatusOf(analysis)),
    notes: analysis.writes.some((write) => 'text' in write && write.report && write.text.includes('\x1b'))
      ? [fillString(template('tryIt.level8.colors', 'program').text, programFacts(analysis))]
      : [],
  }),
};

/** The Try it yourself of a zoom level, for what it shows selected, or null if the level has none yet. */
export function explainTryIt(level: number, analysis: Analysis, selection: string | null = null): TryItExplanation | null {
  const tryIt = TRY_IT[level];
  if (!tryIt) return null;
  const facts = programFacts(analysis);
  const fill = (string: string) => fillString(string, facts);
  if (!tryIt.command) {
    const none = { output: '', observed: [], nothingPrinted: [], rows: [], read: [], links: [], linksIntro: [], sample: null };
    return { ...none, command: null, summary: fill(tryIt.summary!), intro: fill(tryIt.intro), parts: [] };
  }
  const command = commandFor(tryIt.command, analysis.fileName);
  const shown = tryIt.inBrowser === false ? OBSERVED_INSTEAD[level](analysis) : ranInBrowser(level, analysis, command);
  return {
    command,
    summary: null,
    intro: fill(tryIt.intro),
    parts: tryIt.parts.map((part) => ({ code: plain(fill(part.code)), text: fill(part.text) })),
    output: shown.output,
    observed: fill(template(shown.observed, 'program').text),
    nothingPrinted: fill(template('tryIt.nothingPrinted', 'program').text),
    rows: shown.rows,
    read: [...shown.notes, ...tryIt.read.map(fill)],
    links: level === 6 ? linksOf(analysis, selection) : [],
    linksIntro: fill(template('tryIt.level6.links', 'program').text),
    sample: level === 7 || level === 8 ? sampleOf(analysis, String(level) as '7' | '8') : null,
  };
}
