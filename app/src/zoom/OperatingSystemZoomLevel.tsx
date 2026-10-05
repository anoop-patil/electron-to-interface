import { CARDS, panelLabel } from '../concepts/concepts';
import { HonestyChip } from '../concepts/HonestyChip';
import { Doors } from '../concepts/visuals';
import { explainProgram, type Span } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import type { Level8 } from '../explain/operatingSystem';
import { stageId } from '../explain/output';
import type { Analysis } from '../generated/analysis';
import { LinePicker, SELECTED_CLASSES } from './LinePicker';

interface LevelProps {
  analysis: Analysis;
  view: Level8;
  /** Selects a line of output at one stage, out-N-S. */
  onSelect(factId: string): void;
}

/** Level 8's four zones, as in prototype v8: where the line can be, from the Program to the terminal app. */
const ZONES = [
  { name: 'Your program', what: 'Python, in RAM' },
  { name: 'System call', what: 'the only way out' },
  { name: 'Operating system', what: 'the kernel' },
  { name: 'Terminal app', what: 'another program' },
];

/** What doors 0, 1 and 2 lead to, from the card that explains them. */
const DOORS = CARDS.fd.visual?.kind === 'doors' ? CARDS.fd.visual.doors : [];

const plain = (spans: Span[]) => spans.map((span) => span.text).join('');

/** The four zones, with the line as a packet of bytes in the one it has reached. It slides in, unless motion is reduced. */
function Zones({ view }: { view: Level8 }) {
  return (
    <div
      className="grid grid-cols-4 overflow-hidden rounded-xl border-[1.5px] border-rule2 narrow:grid-cols-2"
      role="img"
      aria-label={`${ZONES[view.zone].name}: ${view.packet}`}
    >
      {ZONES.map((zone, at) => (
        <div
          key={zone.name}
          className={[
            'flex min-h-[150px] min-w-0 flex-col gap-2 p-3 narrow:min-h-[120px] narrow:border-b narrow:border-rule',
            // The system call is the wall between the Program and the operating system.
            at === 1
              ? 'border-l-4 border-double border-l-ink3 bg-[repeating-linear-gradient(135deg,transparent_0_8px,var(--sunk)_8px_16px)] narrow:border-l-0'
              : 'border-r border-rule last:border-r-0',
            at === 2 ? 'narrow:border-t-4 narrow:border-double narrow:border-t-ink3' : '',
            at === view.zone ? 'bg-accent-soft' : '',
          ].join(' ')}
        >
          <h3 className="text-[14px] font-semibold">{zone.name}</h3>
          {/* ink3 is too faint on the highlight, so the zone the line is in uses ink2. */}
          <p className={`text-[12px] ${at === view.zone ? 'text-ink2' : 'text-ink3'}`}>{zone.what}</p>
          {at === view.zone && (
            <span
              key={`${view.line.id}-${view.zone}`}
              className="mt-auto max-w-full self-start whitespace-pre-wrap rounded-lg bg-ink px-2.5 py-1.5 font-mono text-[12px] text-surface [overflow-wrap:anywhere] motion-safe:animate-packet"
            >
              {view.packet}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Zoom level 8: one line of output, followed from the pieces the Program handed to Python's output object, through a
 * system call, into the operating system and on to the terminal app, as on a typical Linux terminal.
 */
export function OperatingSystemZoomLevel({ analysis, view, onSelect }: LevelProps) {
  const program = (id: Parameters<typeof explainProgram>[0]) => explainProgram(id, analysis).text;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px] text-ink3">
        <span>
          <ExplanationText spans={program('level8.caption')} />
        </span>
        <span>
          <ExplanationText spans={program('level8.pick')} />
        </span>
      </div>
      <LinePicker lines={view.lines} line={view.line} onPick={(other) => onSelect(stageId(other, view.stage))} />
      {analysis.writesCutShort && (
        <p className="text-[13px] text-ink2">
          <ExplanationText spans={program('level8.cutShort')} />
        </p>
      )}
      <Zones view={view} />
      <ol className="grid gap-1.5" aria-label="Stages">
        {view.stages.map((stage, at) => {
          const selected = at + 1 === view.stage;
          return (
            <li key={stage.id}>
              <button
                type="button"
                className={`grid w-full cursor-pointer grid-cols-[26px_minmax(0,1fr)] items-start gap-2.5 rounded-lg border-[1.5px] px-3 py-2.5 text-left ${selected ? SELECTED_CLASSES : 'border-rule bg-surface hover:bg-sunk'}`}
                aria-pressed={selected}
                onClick={() => onSelect(stage.id)}
              >
                <span className="font-mono text-[13px] font-semibold text-ink3">{at + 1}</span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-[15px]">{plain(stage.title)}</span>
                  <code className="whitespace-pre-wrap text-[13px] text-ink2 [overflow-wrap:anywhere]">{stage.code}</code>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink3">
        <HonestyChip label={panelLabel(view.derived ? 'reportPieces' : 'outputPieces')} size="panel" />
        <span>
          <ExplanationText spans={program(view.piecesNote)} />
        </span>
      </p>
      <section className="grid gap-2.5 rounded-xl border border-rule bg-surface px-3.5 py-3" aria-label="Doors">
        <h3 className="text-[14px] font-semibold">
          <ExplanationText spans={program('level8.doors')} />{' '}
          <span className="font-normal text-ink3">
            <ExplanationText spans={program('level8.doorsNote')} />
          </span>
        </h3>
        <Doors doors={DOORS} used={view.line.door} />
      </section>
    </div>
  );
}
