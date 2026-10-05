import { Fragment } from 'react';
import { levelLabel } from '../concepts/concepts';
import { HonestyChip } from '../concepts/HonestyChip';
import { explainProgram, type Span, type TemplateId } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import { LIBRARY } from '../explain/reference';
import type { HandlerShown, Level6 } from '../explain/interpreter';
import { explainForStep } from '../explain/steps';
import type { Analysis } from '../generated/analysis';
import { RunBar, StepLists } from './BytecodeZoomLevel';

/** Where the site serves CPython's license, which must ship with the C it quotes. */
const CPYTHON_LICENSE = '/licenses/CPython-LICENSE.txt';

/** The C source file's own name: bytecodes.c. */
const SOURCE_FILE = LIBRARY.source.file.split('/').at(-1);

interface LevelProps {
  analysis: Analysis;
  view: Level6;
  /** Selects a step run, run-N, or a step that never ran, bc-N. */
  onSelect(factId: string): void;
  onGo(level: number): void;
}

/** The Interpreter handoff: your program, translated as far as bytecode, and Python itself, translated long ago. */
function Handoff({ analysis }: { analysis: Analysis }) {
  const tracks = [
    { explanation: explainProgram('level6.yourProgram', analysis), here: false },
    { explanation: explainProgram('level6.pythonItself', analysis), here: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 narrow:grid-cols-1" aria-label="The Interpreter handoff">
      {tracks.map(({ explanation, here }, at) => (
        <div key={at} className={`grid gap-1 rounded-xl border-[1.5px] px-3.5 py-2.5 ${here ? 'border-accent bg-accent-soft' : 'border-rule bg-sunk'}`}>
          <b className="text-[14px] font-semibold">
            <ExplanationText spans={explanation.title!} />
          </b>
          <span className="text-[13px] text-ink2">
            <ExplanationText spans={explanation.text} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** The four moves the interpreter repeats for every step: read it, look up its C, run that C, move on. */
function Moves({ analysis, view }: { analysis: Analysis; view: Level6 }) {
  const { step, run } = view.selected;
  const shown = view.handlers.length > 0;
  const last = run !== null && run === analysis.runs.length - 1;
  const running: TemplateId = run === null ? 'level6.runNeverRan' : shown ? 'level6.run' : 'level6.runTypical';
  const moves: Span[][] = [
    explainForStep('level6.read', analysis, step, run).text,
    explainForStep(shown ? 'level6.lookUp' : 'level6.lookUpTypical', analysis, step, run).text,
    explainProgram(running, analysis).text,
    explainProgram(last ? 'level6.moveOnDone' : 'level6.moveOn', analysis).text,
  ];
  return (
    <div className="grid gap-2">
      <p className="text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level6.loop', analysis).text} />
      </p>
      <ol className="grid grid-cols-4 gap-2 narrow:grid-cols-2">
        {moves.map((move, at) => (
          <li key={at} className={`rounded-[10px] border px-3 py-2 text-[13px] leading-[1.5] text-ink2 [overflow-wrap:anywhere] ${at === 2 ? 'border-accent' : 'border-rule'}`}>
            <ExplanationText spans={move} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One handler's C: its heading, links to its lines on GitHub, what is shown, then each sentence above its line of C. */
function HandlerBlock({ handler, title }: { handler: HandlerShown; title: Span[] }) {
  return (
    <section className="grid min-w-0 gap-2 rounded-xl border border-rule bg-sunk px-3.5 py-3" aria-label={`The C code of ${handler.handler}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[14px] font-semibold">
          <ExplanationText spans={title} />
        </h3>
        <span className="text-[13px] text-ink2">
          {SOURCE_FILE}:{' '}
          {handler.links.map(({ where, href }, at) => (
            <Fragment key={href}>
              {at > 0 && ' · '}
              <a className="text-accent underline underline-offset-2" href={href} target="_blank" rel="noopener noreferrer">
                {where}
              </a>
            </Fragment>
          ))}
        </span>
      </div>
      <p className="text-[13px] leading-[1.55] text-ink2">
        <ExplanationText spans={handler.note} />
      </p>
      <ol className="grid gap-1.5">
        {handler.lines.map((line, at) => (
          <li key={at} className="grid gap-1 rounded-lg border border-rule bg-surface px-2.5 py-2">
            <span className="flex gap-2 text-[14px] leading-[1.5]">
              <i className="font-mono text-[12px] not-italic leading-[1.75] text-ink3">{at + 1}</i>
              <span>
                <ExplanationText spans={line.say} />
              </span>
            </span>
            <code className="flex gap-2 font-mono text-[12.5px] leading-[1.6] [overflow-wrap:anywhere]">
              <span className="flex-none text-ink3" aria-label={line.first === line.last ? `line ${line.first}` : `lines ${line.first} to ${line.last}`}>
                {line.first === line.last ? line.first : `${line.first}–${line.last}`}
              </span>
              <span className="min-w-0 whitespace-pre-wrap">{line.code}</span>
            </code>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A note above the C, on how this step run differs. */
const Note = ({ spans }: { spans: Span[] }) => (
  <p className="rounded-[10px] border border-rule bg-surface px-3 py-2.5 text-[13px] leading-[1.55] text-ink2">
    <ExplanationText spans={spans} />
  </p>
);

/** The C of each handler that ran for the selected step run: for a run that rewrote its step, the general form's, then the new form's. */
function Handlers({ analysis, view }: { analysis: Analysis; view: Level6 }) {
  const { step, run } = view.selected;
  const note = (id: 'level6.ranInside' | 'level6.neverRan' | 'level6.generalForm' | 'level6.newForm') => explainForStep(id, analysis, step, run).text;
  const two = view.handlers.length > 1;
  return (
    <>
      {view.handlers[0]?.inside && <Note spans={note('level6.ranInside')} />}
      {run === null && <Note spans={note('level6.neverRan')} />}
      {view.handlers.map((handler, at) => (
        <HandlerBlock
          key={handler.entry}
          handler={handler}
          title={two ? note(at === 0 ? 'level6.generalForm' : 'level6.newForm') : [{ text: handler.handler, strong: true }]}
        />
      ))}
    </>
  );
}

/**
 * Zoom level 6: the Interpreter handoff, the four moves the interpreter repeats for every step, each code object's
 * steps, and, for the selected step run, the real C code of each handler that ran, from the Reference Library.
 */
export function InterpreterZoomLevel({ analysis, view, onSelect, onGo }: LevelProps) {
  const levelProps = { analysis, selected: view.selected, onSelect, onGo };
  const shown = view.handlers.length > 0;
  return (
    <div className="grid gap-4">
      <Handoff analysis={analysis} />
      <Moves analysis={analysis} view={view} />
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5 narrow:grid-cols-[minmax(0,1fr)]">
        <StepLists {...levelProps} />
        <div className="grid min-w-0 content-start gap-3">
          <RunBar {...levelProps} />
          {shown && <Handlers analysis={analysis} view={view} />}
        </div>
      </div>
      {shown && (
        <div className="grid max-w-[80ch] gap-1.5 text-[13px] leading-[1.6] text-ink3">
          <p>
            <ExplanationText spans={explainForStep('level6.recorded', analysis, view.selected.step, view.selected.run).text} />{' '}
            <HonestyChip label={levelLabel(6)!} size="panel" />
          </p>
          <p>
            <ExplanationText spans={explainProgram('level6.license', analysis).text} />{' '}
            <a className="text-accent underline underline-offset-2" href={CPYTHON_LICENSE} target="_blank" rel="noopener">
              Read the PSF License
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
