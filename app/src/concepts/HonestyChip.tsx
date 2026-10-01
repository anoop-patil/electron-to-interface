import type { HonestyLabel } from '../generated/analysis';
import { HONESTY_CARD } from './concepts';
import { useConcepts } from './ConceptsProvider';

// A zoom level's chip, or a smaller one on a panel. Every label has the same border: labels are words, never border styles (ADR 0005).
const SIZES = {
  level: { chip: 'min-h-9 gap-2 px-3.5 text-[13px]', dot: 'h-[7px] w-[7px]', color: 'border-ink2 text-ink2', hover: 'hover:bg-sunk' },
  panel: { chip: 'gap-[5px] px-2 py-px text-[11px]', dot: 'h-1.5 w-1.5', color: 'border-ink3 text-ink3', hover: 'hover:bg-surface' },
};
// Only Illustrative gets a color of its own.
const WARNING = 'border-warn text-warn';

function chipClass(label: HonestyLabel, size: keyof typeof SIZES) {
  const { chip, color } = SIZES[size];
  return `inline-flex items-center whitespace-nowrap rounded-full border-[1.5px] leading-[normal] ${chip} ${label.warning ? WARNING : color}`;
}

const Dot = ({ size }: { size: keyof typeof SIZES }) => <span className={`flex-none rounded-full bg-current ${SIZES[size].dot}`} aria-hidden="true" />;

/** An Honesty label as a text chip. It opens the How we know card. */
export function HonestyChip({ label, size = 'level' }: { label: HonestyLabel; size?: keyof typeof SIZES }) {
  const { openCard } = useConcepts();
  return (
    <button
      type="button"
      className={`${chipClass(label, size)} cursor-pointer ${SIZES[size].hover}`}
      aria-label={`How we know: ${label.name}`}
      aria-haspopup="dialog"
      onClick={() => openCard(HONESTY_CARD)}
    >
      <Dot size={size} />
      {label.name}
    </button>
  );
}

/** The same chip as plain text, for the How we know card, where it opens nothing. */
export const HonestyChipText = ({ label }: { label: HonestyLabel }) => (
  <span className={chipClass(label, 'level')}>
    <Dot size="level" />
    {label.name}
  </span>
);
