import { useState, type ReactNode } from 'react';
import { levelLabel, panelLabel } from '../concepts/concepts';
import { HonestyChip } from '../concepts/HonestyChip';
import { explainProgram, type Span, type TemplateId } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import { KIND_NAMES, KINDS, level7IsReference, type HandlerMachine, type InstructionShown, type Kind, type Level7 } from '../explain/machine';
import { explainForStep } from '../explain/steps';
import type { Analysis } from '../generated/analysis';
import { RunBar, StepLists } from './BytecodeZoomLevel';
import { CPYTHON_LICENSE, Handoff } from './InterpreterZoomLevel';

interface LevelProps {
  analysis: Analysis;
  view: Level7;
  /** Selects a step run, run-N, or a step that never ran, bc-N. */
  onSelect(factId: string): void;
  onGo(level: number): void;
}

const KIND_COLORS: Record<Kind, string> = { move: 'text-k-move', math: 'text-k-math', compare: 'text-k-compare', jump: 'text-k-jump', other: 'text-ink2' };

/** A kind of instruction, as a chip in its color, with how many there are if it says. */
const KindChip = ({ kind, count }: { kind: Kind; count?: number }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full border-[1.5px] border-current px-2 py-px text-[11px] font-semibold ${KIND_COLORS[kind]}`}>
    {KIND_NAMES[kind]}
    {count !== undefined && ` ${count}`}
  </span>
);

const PART_NAMES = { main: '', warm: '.warm', cold: '.cold' } as const;

/**
 * A table of instructions: its place, kind, how the page writes it, its part and its bytes. Rows that ran are
 * highlighted, so their quieter text is ink2: ink3 is too faint on the highlight. It scrolls, so it takes focus, for
 * the keyboard to scroll it.
 */
function Listing({ label, rows }: { label: string; rows: (InstructionShown & { ran?: boolean; jumped?: boolean })[] }) {
  return (
    <div className="max-h-[360px] overflow-auto rounded-lg border border-rule bg-surface" tabIndex={0}>
      <table className="w-full border-collapse font-mono text-[12px] leading-[1.5]" aria-label={label}>
        <thead className="sticky top-0 bg-sunk text-left font-sans text-[11.5px] text-ink3">
          <tr>
            <th className="px-2 py-1 font-semibold">#</th>
            <th className="px-2 py-1 font-semibold">Kind</th>
            <th className="px-2 py-1 font-semibold">Instruction</th>
            <th className="px-2 py-1 font-semibold">Part</th>
            <th className="px-2 py-1 font-semibold">Bytes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, at) => {
            const quiet = row.ran ? 'text-ink2' : 'text-ink3';
            return (
              <tr key={at} className={`border-t border-rule align-top ${row.ran ? 'bg-accent-soft' : ''}`}>
                <td className={`px-2 py-0.5 ${quiet}`}>{at + 1}</td>
                <td className={`px-2 py-0.5 font-sans text-[11px] font-semibold ${KIND_COLORS[row.kind]}`}>{KIND_NAMES[row.kind]}</td>
                <td className="whitespace-pre-wrap px-2 py-0.5 [overflow-wrap:anywhere]">
                  {row.text}
                  {row.jumped !== undefined && <span className="font-sans text-ink3">{row.jumped ? ' · jumped' : ' · didn’t jump'}</span>}
                </td>
                <td className={`px-2 py-0.5 ${quiet}`}>{PART_NAMES[row.part]}</td>
                <td className={`px-2 py-0.5 ${quiet}`}>{row.bytes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A <details> whose contents are drawn only once it is open: a handler's full listing runs to hundreds of rows. */
function LazyDetails({ summary, children }: { summary: Span[]; children: () => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="grid gap-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-[13px] font-semibold text-accent">
        <ExplanationText spans={summary} />
      </summary>
      {open && <div className="mt-2">{children()}</div>}
    </details>
  );
}

/** One handler's machine code for the selected step run: what it is, the path it took, its key lines, then its full listings. */
function HandlerBlock({ handler }: { handler: HandlerMachine }) {
  return (
    <section className="grid min-w-0 gap-2.5 rounded-xl border border-rule bg-sunk px-3.5 py-3" aria-label={`The machine code of ${handler.handler}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[14px] font-semibold">
          <ExplanationText spans={handler.title} />
        </h3>
        <code className="text-[12px] text-ink3 [overflow-wrap:anywhere]">{handler.symbol}</code>
      </div>
      {handler.summary.map((spans, at) => (
        <p key={at} className="text-[13px] leading-[1.55] text-ink2">
          <ExplanationText spans={spans} />
        </p>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {handler.kinds.map(({ kind, count }) => (
          <KindChip key={kind} kind={kind} count={count} />
        ))}
      </div>
      <p className="rounded-[10px] border border-rule bg-surface px-3 py-2.5 text-[13px] leading-[1.55] text-ink2">
        <HonestyChip label={levelLabel(7)!} size="panel" /> <ExplanationText spans={handler.path} />
      </p>
      <div className="grid gap-1.5">
        <h4 className="text-[13px] font-semibold">
          <ExplanationText spans={handler.keyLinesTitle} />
        </h4>
        <ol className="grid gap-1.5">
          {handler.keyLines.map((line, at) => (
            <li key={at} className="grid gap-1">
              {line.stage && <h5 className="mt-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink3">{line.stage}</h5>}
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 rounded-lg border border-rule bg-surface px-2.5 py-2">
                <KindChip kind={line.kind} />
                <div className="grid gap-0.5">
                  <span className="text-[13.5px] leading-[1.5]">
                    <ExplanationText spans={line.say} />
                  </span>
                  <code className="whitespace-pre-wrap text-[12.5px] [overflow-wrap:anywhere]">{line.text}</code>
                  <span className="font-mono text-[11.5px] text-ink3">
                    <span className="font-sans">its bytes </span>
                    {line.bytes}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <LazyDetails summary={handler.ranTitle}>{() => <Listing label={`The instructions ${handler.handler} ran, in order`} rows={handler.ran} />}</LazyDetails>
      <LazyDetails summary={handler.allTitle}>{() => <Listing label={`All the instructions of ${handler.handler}`} rows={handler.all} />}</LazyDetails>
    </section>
  );
}

/** A note above the machine code, on how this step run differs. */
const Note = ({ children }: { children: ReactNode }) => (
  <div className="grid justify-items-start gap-2 rounded-[10px] border border-rule bg-surface px-3 py-2.5 text-[13px] leading-[1.55] text-ink2">{children}</div>
);

/** The registers these handlers use, worked out by reading their machine code: Derived. */
function Registers({ analysis }: { analysis: Analysis }) {
  const registers: [string, TemplateId][] = [
    ['r15', 'level7.register.r15'],
    ['r13', 'level7.register.r13'],
    ['r12', 'level7.register.r12'],
    ['edi', 'level7.register.edi'],
    ['rax', 'level7.register.rax'],
    ['rsp', 'level7.register.rsp'],
  ];
  return (
    <section className="grid gap-2.5 rounded-xl border border-rule bg-surface px-3.5 py-3" aria-label="Registers">
      <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
        <ExplanationText spans={explainProgram('level7.registers', analysis).text} />
        <HonestyChip label={panelLabel('registers')} size="panel" />
      </h3>
      <dl className="grid grid-cols-3 gap-2 narrow:grid-cols-2">
        {registers.map(([name, id]) => (
          <div key={name} className="grid gap-0.5 rounded-lg border border-rule bg-sunk px-2.5 py-2">
            <dt className="font-mono text-[13px] font-semibold">{name}</dt>
            <dd className="text-[12.5px] leading-[1.45] text-ink2">
              <ExplanationText spans={explainProgram(id, analysis).text} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[12.5px] text-ink3">
        <ExplanationText spans={explainProgram('level7.registersNote', analysis).text} />
      </p>
    </section>
  );
}

/**
 * Zoom level 7: Python itself, translated to machine code long ago, and, for the selected step run, the real machine
 * code of each handler that ran, with the path it took, from the Reference Library.
 */
export function CpuZoomLevel({ analysis, view, onSelect, onGo }: LevelProps) {
  const levelProps = { analysis, selected: view.selected, onSelect, onGo };
  const { step, run } = view.selected;
  const shown = view.handlers.length > 0;
  const forStep = (id: TemplateId) => explainForStep(id, analysis, step, run).text;
  return (
    <div className="grid gap-4">
      <Handoff analysis={analysis} />
      {shown && (
        <p className="text-[14px] leading-[1.6] text-ink2">
          <ExplanationText spans={forStep('level7.provenance')} /> <HonestyChip label={levelLabel(7)!} size="panel" />
        </p>
      )}
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-1.5" aria-label="Kinds of instruction">
          {KINDS.map((kind) => (
            <KindChip key={kind} kind={kind} />
          ))}
        </div>
        <p className="text-[13px] text-ink2">
          <ExplanationText spans={explainProgram('level7.kinds', analysis).text} />
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5 narrow:grid-cols-[minmax(0,1fr)]">
        <StepLists {...levelProps} />
        <div className="grid min-w-0 content-start gap-3">
          <RunBar {...levelProps} />
          {run === null && level7IsReference(view) && (
            <Note>
              <p>
                <ExplanationText spans={forStep('level7.neverRan')} />
              </p>
            </Note>
          )}
          {view.inside && (
            <Note>
              <p>
                <ExplanationText spans={forStep('level7.ranInside')} />
              </p>
              <button type="button" className="cursor-pointer text-[13px] font-semibold text-accent underline underline-offset-2" onClick={() => onSelect(view.inside!.run)}>
                <ExplanationText spans={forStep('level7.showInside')} />
              </button>
            </Note>
          )}
          {view.handlers.map((handler) => (
            <HandlerBlock key={handler.entry} handler={handler} />
          ))}
        </div>
      </div>
      <Registers analysis={analysis} />
      <div className="grid max-w-[80ch] gap-1.5 text-[13px] leading-[1.6] text-ink3">
        <p>
          <ExplanationText spans={explainProgram('level7.clock', analysis).text} />
        </p>
        {shown && (
          <>
            <p>
              <ExplanationText spans={forStep('level7.recorded')} /> <HonestyChip label={levelLabel(7)!} size="panel" />
            </p>
            <p>
              <ExplanationText spans={explainProgram('level7.license', analysis).text} />{' '}
              <a className="text-accent underline underline-offset-2" href={CPYTHON_LICENSE} target="_blank" rel="noopener">
                Read the PSF License
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
