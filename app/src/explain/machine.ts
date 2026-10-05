import type { Analysis, HandlerRun, HandlerSlot, LineNotes, MachineInstruction, StepSlot } from '../generated/analysis';
import { fillString, joined, template, type Explanation, type Span, type TemplateId } from './explain';
import { LIBRARY, exampleOf, handlerOf, handlersRun } from './reference';
import { explainForStep, stepFacts, stepSelectionAt, type StepSelection } from './steps';

/** The broad kinds machine instructions are sorted into, in the order the page lists them. */
export const KINDS = ['move', 'math', 'compare', 'jump', 'other'] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_NAMES: Record<Kind, string> = { move: 'Move', math: 'Math', compare: 'Compare', jump: 'Jump', other: 'Other' };

/** An instruction's kind, from its mnemonic, as prototypes v7 and v8 sort them. */
export function kindOf(mnemonic: string): Kind {
  if (/^(j|call|ret)/.test(mnemonic)) return 'jump';
  if (/^(cmp|test)/.test(mnemonic)) return 'compare';
  if (/^(add|sub|inc|dec|imul|mul|div|idiv|and|or|xor|not|neg|shl|shr|sar|sal|rol|ror)/.test(mnemonic)) return 'math';
  if (/^(mov|lea|push|pop|cmov)/.test(mnemonic)) return 'move';
  return 'other';
}

/** An instruction as the page writes it: a jump or call to a named function by its name, otherwise its operands. */
export function instructionText({ mnemonic, operands, note }: MachineInstruction) {
  if (note?.startsWith('fn:')) return `${mnemonic}  ${note.slice('fn:'.length)}`;
  if (note === 'rare') return `${mnemonic}  <rare-case code>`;
  return operands ? `${mnemonic}  ${operands}` : mnemonic;
}

/** Whether an instruction is a jump that happens only if a check came out one way: je, jne, jle and so on. */
const conditional = ({ mnemonic }: MachineInstruction) => mnemonic.startsWith('j') && mnemonic !== 'jmp';

/** The address after an instruction, where the CPU carries on unless it jumps. */
const after = ({ at, bytes }: MachineInstruction) => (parseInt(at, 16) + bytes.split(' ').length).toString(16);

/** One instruction in a listing: its kind, how the page writes it, its part and its bytes. */
export interface InstructionShown {
  kind: Kind;
  text: string;
  part: 'main' | 'warm' | 'cold';
  bytes: string;
}

/** A key line: an instruction that ran and says something, in the order they first ran, under a stage heading if one starts there. */
export interface KeyLine extends InstructionShown {
  say: Span[];
  stage?: string;
}

/** One handler that ran for the selected step run, as zoom level 7 shows it. */
export interface HandlerMachine {
  handler: string;
  entry: string;
  symbol: string;
  title: Span[];
  /** How many instructions it has and how big it is, how many ran, and the functions it called. */
  summary: Span[][];
  /** How many of all its instructions are of each kind. */
  kinds: { kind: Kind; count: number }[];
  /** What the highlighted path is, and what it shows. */
  path: Span[];
  keyLines: KeyLine[];
  keyLinesTitle: Span[];
  /** The instructions that ran, in order. A conditional jump says whether it jumped. */
  ran: (InstructionShown & { jumped?: boolean })[];
  ranTitle: Span[];
  /** All its instructions, main part first, each saying whether it ran. */
  all: (InstructionShown & { ran: boolean })[];
  allTitle: Span[];
}

/** Zoom level 7's Selection, and what it shows for it. */
export interface Level7 {
  selected: StepSelection;
  example: string | null;
  /** The machine code of each handler that ran, in order. Empty if the Reference Library has none for this step run. */
  handlers: HandlerMachine[];
  /** For a step run whose work ran inside the handler before it: that handler, and the step run that ran it. */
  inside: { handler: string; run: string } | null;
}

const PARTS = { main: 'main part', warm: '.warm part', cold: '.cold part' } as const;
const number = (value: number) => value.toLocaleString('en-US');

/** A number of instructions, in words: 147 instructions. */
const instructions = (count: number) => `${number(count)} ${count === 1 ? 'instruction' : 'instructions'}`;

/** The notes the Reference Library has on single instructions of this handler run, if it has any. */
function lineNotesOf(analysis: Analysis, at: number | null, handler: string): LineNotes | undefined {
  const example = exampleOf(analysis);
  return LIBRARY.lineNotes.find((notes) => notes.example === example?.name && notes.run === at && notes.handler === handler);
}

/** What a key line says about the instruction at this place in the path, if anything: the Example's own note, else the kind of jump or call it is. */
function keySay(run: HandlerRun, place: number, instruction: MachineInstruction, jumped: boolean, notes: LineNotes | undefined, facts: Record<string, string>): Span[] | null {
  const own = notes?.lines[instruction.at];
  if (own !== undefined) {
    const value = run.values?.find((changed) => changed.at === place);
    return fillString(own, { ...facts, before: value ? number(value.before) : '', after: value ? number(value.after) : '' });
  }
  const line = (id: TemplateId, more: Partial<Record<HandlerSlot, string>> = {}) => fillString(template(id, 'handler').text, { ...facts, ...more });
  const note = instruction.note ?? '';
  if (note === 'dispatch') return line('level7.line.dispatch');
  if (note.startsWith('fn:_TAIL_CALL_')) {
    const to = note.slice('fn:_TAIL_CALL_'.length);
    return line(instruction.mnemonic === 'jmp' || jumped ? 'level7.line.jumpTo' : 'level7.line.check', { to });
  }
  if (instruction.mnemonic === 'call' && note.startsWith('fn:')) {
    const fn = note.slice('fn:'.length);
    const does = LIBRARY.functions[fn];
    return does ? line('level7.line.call', { fn, does }) : line('level7.line.callOther', { fn });
  }
  if (note === 'indirect') return line('level7.line.indirect');
  if (place === 0 && !notes) return line('level7.line.starts');
  return null;
}

const shown = (instruction: MachineInstruction): InstructionShown => ({
  kind: kindOf(instruction.mnemonic),
  text: instructionText(instruction),
  part: instruction.part ?? 'main',
  bytes: instruction.bytes,
});

/** One handler run, as level 7 shows it, with its sentences filled in with the step run's Facts and its own. */
function handlerMachine(analysis: Analysis, selected: StepSelection, run: HandlerRun, order: 'first' | 'then' | 'only'): HandlerMachine {
  const handler = handlerOf(run.entry);
  const code = LIBRARY.machineCode.handlers[handler];
  const byAddress = new Map(code.instructions.map((instruction) => [instruction.at, instruction]));
  const path = run.path!.map((at) => byAddress.get(at)!);
  const notes = lineNotesOf(analysis, selected.run, handler);

  const ranParts = (['main', 'warm', 'cold'] as const)
    .map((part) => ({ part, count: path.filter((instruction) => (instruction.part ?? 'main') === part).length }))
    .filter(({ count }) => count > 0);
  const calls = run.calls ?? [];
  const facts: Record<StepSlot | HandlerSlot, string> = {
    ...stepFacts(analysis, selected.step, selected.run),
    handler,
    symbol: code.symbol,
    instructions: instructions(code.instructions.length),
    main: number(code.instructions.filter((instruction) => !instruction.part).length),
    size: `${number(code.size)} bytes`,
    moved: code.warm + code.cold > 0 ? `${number(code.warm + code.cold)} bytes` : '',
    ran: instructions(path.length),
    parts: joined(ranParts.map(({ part, count }) => `${number(count)} in its ${PARTS[part]}`)),
    calls: joined(calls.map(({ function: fn, times }) => (times > 1 ? `${fn} ${times} times` : fn))),
    copied: run.copied?.entry ?? '',
    copiedCount: run.copied ? instructions(path.length - run.copied.from) : '',
    to: '',
    fn: '',
    does: '',
    repeats: '',
    before: '',
    after: '',
  };
  const say = (id: TemplateId) => fillString(template(id, 'handler').text, facts);

  const jumped = path.map((instruction, place) => conditional(instruction) && (place === path.length - 1 || run.path![place + 1] !== after(instruction)));
  // Each instruction that says something, the first time it ran. Lines in a row that say the same, such as a run of
  // checks, are shown once, with how many there were.
  const lines: { line: KeyLine; text: string; repeats: number }[] = [];
  const seen = new Set<string>();
  path.forEach((instruction, place) => {
    if (seen.has(instruction.at)) return;
    seen.add(instruction.at);
    const said = keySay(run, place, instruction, jumped[place], notes, facts);
    if (!said) return;
    const text = said.map((span) => span.text).join('');
    const previous = lines.at(-1);
    if (previous && !notes && previous.text === text) previous.repeats += 1;
    else lines.push({ line: { ...shown(instruction), say: said, ...(notes?.stages?.[instruction.at] && { stage: notes.stages[instruction.at] }) }, text, repeats: 1 });
  });
  const keyLines = lines.map(({ line, repeats }) =>
    repeats === 1 ? line : { ...line, say: [...line.say, { text: ' ' }, ...fillString(template('level7.line.repeats', 'handler').text, { ...facts, repeats: String(repeats) })] },
  );

  const ran = new Set(run.path);
  const entry = LIBRARY.entries[run.entry];
  const note = notes?.note ?? entry?.pathNote;
  return {
    handler,
    entry: run.entry,
    symbol: code.symbol,
    title: say(order === 'first' ? 'level7.first' : order === 'then' ? 'level7.then' : 'level7.only'),
    summary: [
      [...say(code.warm + code.cold > 0 ? 'level7.sizeMoved' : 'level7.size'), { text: ' ' }, ...say('level7.ran')],
      ...(calls.length > 0 ? [say('level7.called')] : []),
    ],
    kinds: KINDS.map((kind) => ({ kind, count: code.instructions.filter((instruction) => kindOf(instruction.mnemonic) === kind).length })).filter(({ count }) => count > 0),
    path: [
      ...say('level7.path'),
      ...(note ? [{ text: ' ' }, ...fillString(note, facts)] : []),
      ...(run.copied ? [{ text: ' ' }, ...say('level7.copied')] : []),
    ],
    keyLines,
    keyLinesTitle: say('level7.keyLines'),
    ran: path.map((instruction, place) => ({ ...shown(instruction), ...(conditional(instruction) && { jumped: jumped[place] }) })),
    ranTitle: say('level7.showRan'),
    all: code.instructions.map((instruction) => ({ ...shown(instruction), ran: ran.has(instruction.at) })),
    allTitle: say('level7.showAll'),
  };
}

/**
 * What zoom level 7 shows for the learner's Selection: the step run closest to it, and the machine code of each
 * handler that ran for it, with the path it took. Null if the Program has no steps.
 */
export function level7(analysis: Analysis, selection: string | null): Level7 | null {
  const selected = stepSelectionAt(analysis, selection, 7);
  if (!selected) return null;
  const runs = handlersRun(analysis, selected.step.step, selected.run).filter((run) => run.path);
  const handlers = runs.map((run, at) => handlerMachine(analysis, selected, run, runs.length === 1 ? 'only' : at === 0 ? 'first' : 'then'));
  return { selected, example: exampleOf(analysis)?.name ?? null, handlers, inside: insideOf(analysis, selected) };
}

/** For a step run whose work ran inside the handler before it, that handler, and the step run before, which ran it. */
function insideOf(analysis: Analysis, { step, run }: StepSelection): Level7['inside'] {
  const [first] = handlersRun(analysis, step.step, run);
  if (!first?.inside || run === null || run === 0) return null;
  const before = exampleOf(analysis)!.runs[run - 1].handlers.at(-1);
  return before?.copied?.entry === first.entry ? { handler: first.inside, run: analysis.runs[run - 1].id } : null;
}

/** Whether level 7 shows real machine code, or says why there is none, rather than how it usually works: Reference, not Typical. */
export const level7IsReference = ({ selected, example, handlers, inside }: Level7) => handlers.length > 0 || inside !== null || (example !== null && selected.run === null);

/** The Explanation of what level 7 shows: how many instructions each handler ran, or why none ran, or how it usually works. */
export function explainLevel7(analysis: Analysis, view: Level7): Explanation {
  const { step, run } = view.selected;
  let id: TemplateId = 'level7.stepTypical';
  if (view.handlers.length > 0) id = 'level7.step';
  else if (view.inside) id = 'level7.stepInside';
  else if (level7IsReference(view)) id = 'level7.stepNeverRan';
  return explainForStep(id, analysis, step, run);
}

/** With no machine code to show, the form Python rewrote the step into when the Program ran unwatched, if it did: Observed, unlike the rest. */
export function level7AfterRun(analysis: Analysis, view: Level7): Span[] | null {
  const { afterRun, opname } = view.selected.step.step;
  if (level7IsReference(view) || !afterRun || afterRun === opname) return null;
  return explainForStep('level7.afterRun', analysis, view.selected.step, view.selected.run).text;
}
