import type { Analysis, OutputSlot } from '../generated/analysis';
import { selectionAt } from '../zoom/selection';
import { counted, fillString, joined, template, type Explanation, type Span, type TemplateId } from './explain';
import { lineById, outputLines, STAGES, stageId, stageOf, streamOf, systemCalls, type OutputLine } from './output';

/** Level 8's four zones, left to right: the Program, the system call, the operating system and the terminal app. */
export type Zone = 0 | 1 | 2 | 3;

/** The zone each stage happens in, as in prototype v8. */
const ZONES: Zone[] = [0, 0, 1, 2, 3];

/** One stage of a line's journey: its title and its code, for the list of stages. */
export interface Stage {
  id: string;
  title: Span[];
  code: string;
}

/** Zoom level 8's Selection, and what it shows for it. */
export interface Level8 {
  lines: OutputLine[];
  line: OutputLine;
  /** The selected stage, counted from 1. */
  stage: number;
  stages: Stage[];
  /** The zone the line is in at the selected stage, and what its packet says there. */
  zone: Zone;
  packet: string;
  /** Whether the line's pieces were worked out, rather than recorded: a traceback, which Python colors for a terminal. */
  derived: boolean;
  /** What the page says about how it knows the line's pieces: recorded in the browser, or for an Example when the site was built, or worked out. */
  piecesNote: TemplateId;
}

/** A piece as Python's repr writes it: 'Hello,', '\n', "it's", with any character that isn't printable escaped. */
export function pythonRepr(text: string) {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  const ESCAPES: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\\': '\\\\', [quote]: `\\${quote}` };
  let shown = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (ESCAPES[char]) shown += ESCAPES[char];
    // Python escapes control and format characters and every kind of space but the plain one.
    else if (char !== ' ' && /[\p{C}\p{Z}]/u.test(char)) {
      if (code <= 0xff) shown += `\\x${code.toString(16).padStart(2, '0')}`;
      else if (code <= 0xffff) shown += `\\u${code.toString(16).padStart(4, '0')}`;
      else shown += `\\U${code.toString(16).padStart(8, '0')}`;
    } else shown += char;
  }
  return quote + shown + quote;
}

/** Bytes as strace writes them: in quotes, with \n, \t and the like, and any other byte that isn't a plain character in octal: \303. */
export function straceString(text: string) {
  const bytes = new TextEncoder().encode(text);
  const escapes: Record<number, string> = { 9: '\\t', 10: '\\n', 11: '\\v', 12: '\\f', 13: '\\r', 34: '\\"', 92: '\\\\' };
  let shown = '';
  bytes.forEach((byte, at) => {
    if (escapes[byte]) shown += escapes[byte];
    else if (byte >= 0x20 && byte < 0x7f) shown += String.fromCharCode(byte);
    else {
      // strace writes as few digits as it can, unless a digit follows.
      const next = bytes[at + 1];
      const digits = next !== undefined && next >= 0x30 && next <= 0x37 ? 3 : 1;
      shown += `\\${byte.toString(8).padStart(digits, '0')}`;
    }
  });
  return `"${shown}"`;
}

/** At most `most` items, then … if there were more. */
const firstOf = (items: string[], most: number, between: string) => items.slice(0, most).join(between) + (items.length > most ? `${between}…` : '');

/** The text of a piece the Program handed over, by its place in the Analysis's writes. */
const pieceText = (analysis: Analysis, piece: number) => {
  const write = analysis.writes[piece];
  return 'text' in write ? write.text : '';
};

/** The call that carried a line's last byte. */
const lastCall = (analysis: Analysis, line: OutputLine) => systemCalls(analysis)[line.calls.at(-1)!];

/** How many write calls Python makes: only a lower bound when the record of pieces was cut short. */
const callsFact = (analysis: Analysis) => `${analysis.writesCutShort ? 'at least ' : ''}${counted(systemCalls(analysis).length, 'call', 'calls')}`;

export function outputFacts(analysis: Analysis, line: OutputLine): Record<OutputSlot, string> {
  const lines = outputLines(analysis);
  return {
    line: line.text,
    number: String(lines.indexOf(line) + 1),
    door: String(line.door),
    stream: streamOf(line.door),
    characters: counted(Array.from(line.text).length, 'character', 'characters'),
    bytes: counted(line.bytes, 'byte', 'bytes'),
    colorBytes: counted(line.colorBytes, 'byte', 'bytes'),
    pieces: counted(line.pieces.length, 'piece', 'pieces'),
    callBytes: counted(lastCall(analysis, line).bytes, 'byte', 'bytes'),
    lineCalls: counted(line.calls.length, 'call', 'calls'),
    calls: callsFact(analysis),
    lines: counted(lines.length, 'line', 'lines'),
  };
}

/** The Template that says how a line's bytes waited, by why the call that carried its last byte was sent. */
function bufferTemplate(analysis: Analysis, line: OutputLine): TemplateId {
  if (line.newline) return 'level8.buffer';
  const why: Record<ReturnType<typeof lastCall>['why'], TemplateId> = {
    // A line with no newline of its own, sent because its piece also held the newline of the line before.
    newline: 'level8.bufferWithPiece',
    return: 'level8.bufferReturn',
    flush: 'level8.bufferFlush',
    full: 'level8.bufferFull',
    end: 'level8.bufferEnd',
  };
  return why[lastCall(analysis, line).why];
}

/** Each stage's Templates: the first gives the title, and the rest add sentences, in order. */
function stageTemplates(analysis: Analysis, line: OutputLine, stage: number): TemplateId[] {
  const lines = outputLines(analysis);
  const calls = systemCalls(analysis);
  const shared = lines.filter((other) => other.calls.includes(line.calls.at(-1)!)).length > 1;
  const perLine = !analysis.writesCutShort && calls.length === lines.length && lines.every((other) => other.calls.length === 1);
  // A traceback names the file by where the browser's Python saved it, which differs from where the learner saves it.
  const path = line.report && line.text.includes(`/${analysis.fileName}"`);
  switch (stage) {
    case 1:
      if (!line.report) return [line.door === 1 ? 'level8.pieces' : 'level8.piecesError'];
      return [analysis.error ? 'level8.piecesTraceback' : 'level8.piecesExit'];
    case 2:
      return [bufferTemplate(analysis, line), ...(line.colorBytes > 0 ? ['level8.bufferColor' as const] : []), ...(path ? ['level8.bufferPath' as const] : [])];
    case 3:
      return [
        'level8.call',
        ...(shared ? ['level8.callShared' as const] : []),
        ...(line.calls.length > 1 ? ['level8.callSeveral' as const] : []),
        perLine ? 'level8.allCallsPerLine' : 'level8.allCalls',
        'level8.windows',
      ];
    case 4:
      return ['level8.kernel'];
    default:
      return [line.newline ? 'level8.terminal' : 'level8.terminalNoNewline', ...(line.colorBytes > 0 ? ['level8.terminalColor' as const] : [])];
  }
}

/** The code each stage shows: the pieces, the bytes, the system call, the operating system's part and the terminal's. */
function stageCode(analysis: Analysis, line: OutputLine, stage: number) {
  switch (stage) {
    case 1: {
      const pieces = line.pieces.map((piece, at) => `${at === 0 ? `${streamOf(line.door)}.` : ''}write(${pythonRepr(pieceText(analysis, piece))})`);
      return firstOf(pieces, 6, ' · ');
    }
    case 2:
      return `UTF-8 → ${firstOf(Array.from(new TextEncoder().encode(line.sent), String), 24, ' ')}`;
    case 3: {
      const call = lastCall(analysis, line);
      return `write(${call.door}, ${straceString(call.text)}, ${call.bytes})`;
    }
    case 4:
      return 'kernel → terminal device';
    default:
      return `${counted(line.bytes, 'byte', 'bytes')} → "${line.text}"${line.newline ? ' + a new line' : ''}`;
  }
}

/** What a line's packet says in each zone: the text and its size, then just bytes, then the letters on the screen. */
function packetOf(line: OutputLine, zone: Zone) {
  const bytes = counted(line.bytes, 'byte', 'bytes');
  if (zone <= 1) return `${line.text}${line.newline ? '↵' : ''} · ${bytes}`;
  return zone === 2 ? bytes : line.text;
}

/**
 * What zoom level 8 shows for the learner's Selection: every line of output, the one that follows from the Selection
 * (ADR 0007), and its stages. Null if there is no line to follow.
 */
export function level8(analysis: Analysis, selection: string | null): Level8 | null {
  const id = selectionAt(analysis, selection, 8);
  const line = id && lineById(analysis, id);
  if (!line) return null;
  const facts = outputFacts(analysis, line);
  const stages = Array.from({ length: STAGES }, (_, at) => ({
    id: stageId(line, at + 1),
    title: fillString(template(stageTemplates(analysis, line, at + 1)[0], 'output').title!, facts),
    code: stageCode(analysis, line, at + 1),
  }));
  const stage = stageOf(id);
  const zone = ZONES[stage - 1];
  const derived = line.report && analysis.error !== null;
  const piecesNote = derived ? 'level8.observedReport' : analysis.example ? 'level8.built' : 'level8.observed';
  return { lines: outputLines(analysis), line, stage, stages, zone, packet: packetOf(line, zone), derived, piecesNote };
}

/** The Explanation of the selected stage: its title, and its sentences, filled in with the line's Facts. */
export function explainLevel8(analysis: Analysis, { line, stage }: Level8): Explanation {
  const facts = outputFacts(analysis, line);
  const [first, ...more] = stageTemplates(analysis, line, stage);
  const main = template(first, 'output');
  return {
    title: fillString(main.title!, facts),
    text: [main, ...more.map((id) => template(id, 'output'))].flatMap((found, at) => [...(at > 0 ? [{ text: ' ' }] : []), ...fillString(found.text, facts)]),
  };
}

/**
 * The pieces and flushes the Program asked for, as Try it yourself shows them: a row ends with a piece that holds a
 * newline, a flush, or a change of door. A traceback is left out: Python writes it after the Program has stopped, and
 * its colors are worked out for a terminal, not recorded.
 */
export function piecesOutput(analysis: Analysis, most = 20) {
  const rows: string[] = [];
  let row: string[] = [];
  let door = 0;
  const end = () => {
    if (row.length > 0) rows.push(`${streamOf(door as 1 | 2)} ← ${row.join('  ')}`);
    row = [];
  };
  for (const write of analysis.writes) {
    if (write.door !== door) end();
    door = write.door;
    if ('flush' in write) {
      end();
      rows.push(`${streamOf(write.door)}.flush()`);
      continue;
    }
    if (write.report && analysis.error) continue;
    row.push(pythonRepr(write.text));
    if (write.text.includes('\n')) end();
  }
  end();
  return firstOf(rows, most, '\n');
}

/** The rows of level 8's reading tab: each part of a line strace prints, from the Program's own first calls. */
export function straceRows(analysis: Analysis, exitStatus: number) {
  const calls = systemCalls(analysis);
  const [first] = calls;
  const program = (id: TemplateId) => fillString(template(id, 'program').text, {});
  const exit = { printed: `+++ exited with ${exitStatus} +++`, text: program(exitStatus === 0 ? 'tryIt.straceRow.exit' : 'tryIt.straceRow.exitError') };
  if (!first) return [exit];
  const doors = [...new Set(calls.map((call) => call.door))].sort();
  const counts = calls.slice(0, 3).map((call) => String(call.bytes));
  return [
    { printed: 'write(…)', text: fillString(template('tryIt.straceRow.write', 'output').text, { calls: callsFact(analysis) }) },
    ...doors.map((door) => ({ printed: String(door), text: program(door === 1 ? 'tryIt.straceRow.door1' : 'tryIt.straceRow.door2') })),
    { printed: straceString(first.text), text: program('tryIt.straceRow.text') },
    { printed: calls.length > 3 ? `${counts.join(', ')} …` : joined(counts), text: program('tryIt.straceRow.count') },
    { printed: `= ${first.bytes}`, text: program('tryIt.straceRow.answer') },
    exit,
  ];
}
