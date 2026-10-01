import { useState, type ReactNode } from 'react';
import { panelLabel } from '../concepts/concepts';
import { useConcepts } from '../concepts/ConceptsProvider';
import { HonestyChip } from '../concepts/HonestyChip';
import type { Span } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import type { MapState } from './mapState';
import { PARTS, type PartId } from './parts';

const PART_CLASSES = 'block w-full min-w-0 cursor-pointer text-left';
// A lit part is larger, with its note; an unlit one is a single quiet line.
const LIT_CLASSES = 'rounded-[10px] border-[1.5px] border-accent bg-accent-soft px-2.5 py-2';
const UNLIT_CLASSES = 'rounded-[10px] border border-rule bg-surface px-2.5 py-1 hover:border-ink3';
const GROUP_CLASSES = 'grid min-w-0 gap-1.5 rounded-xl border-[1.5px] border-dashed p-2';
const FLOW_CLASSES = 'text-center text-[11px] leading-[1.3] text-ink3';
const NOTE_CLASSES = 'mt-0.5 block font-mono text-[12px] leading-[1.45] text-ink [overflow-wrap:anywhere]';

function Name({ id, quiet = false }: { id: PartId; quiet?: boolean }) {
  const { name, sub } = PARTS[id];
  return (
    <span className={quiet ? 'text-[12px] font-medium text-ink2' : 'text-[13px] font-semibold'}>
      {name}
      {sub && <small className="ml-1 text-[length:inherit] font-normal text-ink3"> {sub}</small>}
    </span>
  );
}

const Chevron = ({ up }: { up: boolean }) => (
  <svg className={up ? 'rotate-180' : ''} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/**
 * A part of the map, which opens its Concept card. Drawn in full, it shows its size and speed, and its note if it is lit;
 * otherwise it is a single quiet line.
 */
function PartButton({ id, lit, full = lit, note, className }: { id: PartId; lit: boolean; full?: boolean; note?: Span[]; className: string }) {
  const { openCard } = useConcepts();
  const { sizeAndSpeed } = PARTS[id];
  return (
    <button type="button" className={`${PART_CLASSES} ${className}`} aria-haspopup="dialog" aria-current={lit ? 'true' : undefined} onClick={() => openCard(id)}>
      {full ? (
        <>
          <span className="flex flex-wrap items-baseline justify-between gap-x-2">
            <Name id={id} /> {sizeAndSpeed && <span className="text-[11px] text-ink3">{sizeAndSpeed}</span>}
          </span>{' '}
          {note && (
            <span className={NOTE_CLASSES}>
              <ExplanationText spans={note} />
            </span>
          )}
        </>
      ) : (
        <Name id={id} quiet />
      )}
    </button>
  );
}

/**
 * The Machine map: an always-visible picture of the learner's computer, lit where the thing being viewed lives
 * right now. What is lit comes from `state`; every part opens its Concept card. On phones it collapses behind a button.
 */
export function MachineMap({ state }: { state: MapState }) {
  const [hidden, setHidden] = useState(true);
  const notes = new Map(state.lit.map(({ part, note }) => [part, note]));

  const part = (id: PartId) => {
    const lit = notes.has(id);
    return <PartButton id={id} lit={lit} note={notes.get(id)} className={lit ? LIT_CLASSES : UNLIT_CLASSES} />;
  };

  // RAM and the CPU hold other parts. Their title is always written out in full, and opens their own card.
  const group = (id: PartId, children: ReactNode) => {
    const lit = notes.has(id);
    return (
      <div className={`${GROUP_CLASSES} ${lit ? 'border-accent' : 'border-rule2'}`}>
        <PartButton id={id} lit={lit} full note={notes.get(id)} className="px-0.5 pb-0.5" />
        {children}
      </div>
    );
  };

  return (
    <section className="min-w-0 px-[18px] pb-[22px] narrow:border-b narrow:border-rule narrow:px-4 narrow:py-1.5" aria-labelledby="map-title">
      <button
        type="button"
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 text-left text-[13px] font-semibold text-ink2 not-narrow:hidden"
        aria-expanded={!hidden}
        aria-controls="machine-map"
        onClick={() => setHidden(!hidden)}
      >
        Your computer: where is everything?
        <Chevron up={!hidden} />
      </button>
      <div id="machine-map" className={`grid gap-1.5 ${hidden ? 'narrow:hidden' : 'narrow:pb-2.5 narrow:pt-1'}`}>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="map-title" className="text-[13px] font-semibold text-ink2 narrow:sr-only">Your computer</h2>
            {/* The map shows how computers usually work; the learner's own may differ. */}
            <HonestyChip label={panelLabel('machineMap')} size="panel" />
          </div>
          <p className="mt-1 text-[12px] text-ink3">Lit parts are where things are right now. Each part opens a short explanation.</p>
        </div>
        {part('disk')}
        <p className={FLOW_CLASSES} aria-hidden="true">↓ programs are copied into RAM to run</p>
        {group(
          'ram',
          <>
            {part('py')}
            {part('code')}
            <div className="grid grid-cols-2 gap-1.5">
              {part('heap')}
              {part('stack')}
            </div>
          </>,
        )}
        <p className={FLOW_CLASSES} aria-hidden="true">↕ the CPU reads and writes RAM</p>
        {group(
          'cpu',
          <div className="grid grid-cols-2 gap-1.5">
            {part('reg')}
            {part('cache')}
          </div>,
        )}
        {part('os')}
        {part('screen')}
      </div>
    </section>
  );
}
