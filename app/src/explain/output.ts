import type { Analysis } from '../generated/analysis';

/**
 * Zoom level 8's model: how the pieces the Program handed to sys.stdout and sys.stderr (Observed) reach the operating
 * system on a typical Linux terminal (Typical). There, Python's output is line-buffered, in two layers. The text layer
 * gathers pieces into chunks of up to 8,192 bytes and hands them to a buffer of 131,072 bytes. The buffer asks the
 * operating system to write what it holds, in one system call, when a piece holds a newline or a carriage return, when
 * the Program asks for a flush, and when the next chunk won't fit; a chunk bigger than the buffer goes straight out.
 * Whatever is still waiting when the Program's code stops is sent then, stderr's first, before Python reports an
 * error. Each case was checked with strace on CPython 3.14.2, on Ubuntu 26.04 under WSL2, with the programs this
 * module's tests stand for; the sizes are that Python's io.DEFAULT_BUFFER_SIZE and TextIOWrapper._CHUNK_SIZE.
 */

/** Where output goes: door 1, standard output, or door 2, standard error. */
export type Door = 1 | 2;

/** Python's object for a door. */
export const streamOf = (door: Door) => (door === 1 ? 'sys.stdout' : 'sys.stderr');

/** One write system call: the door it writes to, and what it carries. */
export interface SystemCall {
  door: Door;
  text: string;
  /** How many bytes it writes, in UTF-8. */
  bytes: number;
  /**
   * Why Python sent it then: a piece held a newline, or a carriage return; the Program asked for a flush; the buffer
   * had no room for more; or the Program stopped.
   */
  why: 'newline' | 'return' | 'flush' | 'full' | 'end';
}

/** One line of output, as the terminal shows it, and how it got there. */
export interface OutputLine {
  /** Fact ID: out-0 for the first line, in the order the calls that finish them happened. */
  id: string;
  door: Door;
  /** The line, without its newline or any color codes. */
  text: string;
  newline: boolean;
  /** The line as it is sent: with any color codes, and its newline. */
  sent: string;
  /** How many bytes it is, with its newline and any color codes. */
  bytes: number;
  /** How many of those bytes are color codes, as a traceback has in a terminal. */
  colorBytes: number;
  /** The pieces it is made of, as places in the Analysis's writes. */
  pieces: number[];
  /** The calls that carried its bytes, as places in `systemCalls`. */
  calls: number[];
  /** The step run that wrote its last piece, or null for Python's own report, or a piece written after the step runs were cut short. */
  run: number | null;
  /** Whether Python wrote it, to report an error or the message sys.exit was given. */
  report: boolean;
}

interface Model {
  calls: SystemCall[];
  lines: OutputLine[];
}

/** The text layer's chunk, and the buffer under it, in bytes. */
const CHUNK = 8192;
const BUFFER = 131072;

const COLOR_CODE = /\x1b\[[0-9;]*m/g;
const utf8 = (text: string) => new TextEncoder().encode(text).length;

/** A line as it builds up, before the calls that carry it are known. */
interface PartLine {
  door: Door;
  /** Its text so far, with any color codes, without its newline. */
  text: string;
  newline: boolean;
  pieces: number[];
  calls: number[];
  run: number | null;
  report: boolean;
  /** The call that carried its last byte, once one has. */
  lastCall?: number;
  /** Left out: the record of pieces was cut short in the middle of it. */
  cutOff?: boolean;
}

/** Part of a piece that belongs to one line, waiting to be sent. */
interface Waiting {
  line: PartLine;
  text: string;
  bytes: number;
}

/** One door's state: the bytes in the text layer's chunk and in the buffer, what they are, oldest first, and the line being written. */
interface DoorState {
  chunk: number;
  buffered: number;
  waiting: Waiting[];
  line: PartLine | null;
}

const models = new WeakMap<Analysis, Model>();

function modelOf(analysis: Analysis): Model {
  const known = models.get(analysis);
  if (known) return known;
  const calls: SystemCall[] = [];
  const lines: PartLine[] = [];
  const doors: Record<Door, DoorState> = { 1: { chunk: 0, buffered: 0, waiting: [], line: null }, 2: { chunk: 0, buffered: 0, waiting: [], line: null } };

  // A call carries the oldest bytes waiting. Calls only ever end between pieces, so they end between Waiting parts too.
  const send = (door: Door, bytes: number, why: SystemCall['why']) => {
    if (bytes === 0) return;
    const at = calls.length;
    let text = '';
    for (let left = bytes; left > 0; ) {
      const part = doors[door].waiting.shift()!;
      text += part.text;
      left -= part.bytes;
      if (part.line.calls.at(-1) !== at) part.line.calls.push(at);
      part.line.lastCall = at;
    }
    calls.push({ door, text, bytes, why });
  };
  // The text layer hands its chunk to the buffer, which first sends what it holds if the chunk won't fit.
  const toBuffer = (door: Door) => {
    const state = doors[door];
    const chunk = state.chunk;
    state.chunk = 0;
    if (chunk === 0) return;
    if (chunk <= BUFFER - state.buffered) {
      state.buffered += chunk;
      return;
    }
    send(door, state.buffered, 'full');
    state.buffered = 0;
    if (chunk > BUFFER) send(door, chunk, 'full');
    else state.buffered = chunk;
  };
  const flush = (door: Door, why: SystemCall['why']) => {
    toBuffer(door);
    send(door, doors[door].buffered, why);
    doors[door].buffered = 0;
  };
  // Splits a piece into the parts of each line it adds to, and queues them.
  const queue = (door: Door, text: string, piece: number, run: number | null, report: boolean) => {
    const state = doors[door];
    let part: Waiting | null = null;
    for (const char of text) {
      if (!state.line) {
        state.line = { door, text: '', newline: false, pieces: [], calls: [], run, report };
        lines.push(state.line);
      }
      const line = state.line;
      if (!part || part.line !== line) {
        part = { line, text: '', bytes: 0 };
        state.waiting.push(part);
        if (line.pieces.at(-1) !== piece) line.pieces.push(piece);
        line.run = run;
        line.report = report;
      }
      part.text += char;
      part.bytes += utf8(char);
      if (char === '\n') {
        line.newline = true;
        state.line = null;
      } else line.text += char;
    }
  };
  // When the Program's code stops, Python flushes stderr, then stdout.
  const programStopped = () => {
    if (analysis.writesCutShort) {
      // The pieces after the cut are unknown, so the line the cut fell in, and when its bytes went out, are too.
      for (const state of Object.values(doors)) {
        if (state.line) state.line.cutOff = true;
        Object.assign(state, { chunk: 0, buffered: 0, waiting: [], line: null });
      }
    }
    flush(2, 'end');
    flush(1, 'end');
  };

  let stopped = false;
  analysis.writes.forEach((write, piece) => {
    if ('flush' in write) return flush(write.door, 'flush');
    if (write.report && !stopped) {
      programStopped();
      stopped = true;
    }
    const state = doors[write.door];
    const bytes = utf8(write.text);
    if (state.chunk + bytes > CHUNK) toBuffer(write.door);
    queue(write.door, write.text, piece, write.run ?? null, write.report ?? false);
    state.chunk += bytes;
    const newline = write.text.includes('\n');
    const ret = !newline && write.text.includes('\r');
    if (state.chunk >= CHUNK) toBuffer(write.door);
    if (newline || ret) flush(write.door, newline ? 'newline' : 'return');
  });
  if (!stopped) programStopped();
  // As Python ends, it flushes stdout, then stderr.
  flush(1, 'end');
  flush(2, 'end');

  const placed = lines.filter((line) => line.lastCall !== undefined && !line.cutOff);
  // In the order the calls that finish them happened; lines finished by one call come in the order they were written.
  placed.sort((one, other) => one.lastCall! - other.lastCall! || lines.indexOf(one) - lines.indexOf(other));
  const model = {
    calls,
    lines: placed.map((line, at): OutputLine => {
      const text = line.text.replace(COLOR_CODE, '');
      const sent = line.newline ? `${line.text}\n` : line.text;
      return {
        id: `out-${at}`,
        door: line.door,
        text,
        newline: line.newline,
        sent,
        bytes: utf8(sent),
        colorBytes: utf8(line.text) - utf8(text),
        pieces: line.pieces,
        calls: line.calls,
        run: line.run,
        report: line.report,
      };
    }),
  };
  models.set(analysis, model);
  return model;
}

/** The write system calls Python makes for the Program on a typical Linux terminal, in order. */
export const systemCalls = (analysis: Analysis) => modelOf(analysis).calls;

/** Each line of the Program's output, on both doors, in the order the calls that finish them happened. */
export const outputLines = (analysis: Analysis) => modelOf(analysis).lines;

/** Zoom level 8's stages, from print handing over the pieces to the terminal drawing them, as in prototype v8. */
export const STAGES = 5;

/** A line of output, out-N, or one of level 8's elements, out-N-S: that line at stage S, counted from 1. */
const OUTPUT_ID = /^out-(\d+)(?:-([1-9]))?$/;

/** Level 8's elements: a line at one of its stages. */
export const STAGE_ID = /^out-\d+-[1-9]$/;

export const stageId = (line: OutputLine, stage: number) => `${line.id}-${stage}`;

/** The stage a level 8 element is at, or 1 for a line on its own. */
export const stageOf = (id: string) => Number(OUTPUT_ID.exec(id)?.[2] ?? 1);

/** The line of output with this Fact ID, or of this level 8 element. */
export function lineById(analysis: Analysis, id: string) {
  const match = OUTPUT_ID.exec(id);
  return (match && outputLines(analysis)[Number(match[1])]) ?? null;
}

/**
 * The line of output closest to a step run (ADR 0007): the first it wrote a piece of, else the first finished after
 * it, else the last. Null if there is no line to follow.
 */
export function closestLine(analysis: Analysis, run: number): OutputLine | null {
  const lines = outputLines(analysis);
  const wrote = lines.find((line) => line.pieces.some((piece) => analysis.writes[piece].run === run));
  return wrote ?? lines.find((line) => line.run === null || line.run > run) ?? lines.at(-1) ?? null;
}
