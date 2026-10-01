import { textSpans } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import type { ConceptVisual } from '../generated/analysis';
import { bitsOf, utf8Rows } from './bits';
import { HONESTY_LABELS } from './concepts';
import { HonestyChipText } from './HonestyChip';

/** A byte's 8 bits, each with its value under it, and the sum of the ones that are on. */
export function Bits({ value }: { value: number }) {
  const { pattern, bits, sum } = bitsOf(value);
  return (
    <div>
      <div className="mt-1 grid grid-cols-[repeat(8,minmax(0,52px))] gap-1.5 narrow:grid-cols-[repeat(8,minmax(0,1fr))]" role="img" aria-label={`${value} in binary is ${pattern}`}>
        {bits.map((bit) => (
          <div className="flex flex-col items-center gap-1" key={bit.value}>
            <span
              className={`grid h-10 w-full place-items-center rounded-lg border-[1.5px] font-mono text-[16px] font-semibold ${bit.on ? 'border-ink bg-ink text-surface' : 'border-rule2 bg-surface text-ink3'}`}
            >
              {bit.on ? 1 : 0}
            </span>
            <span className={`font-mono text-[12px] leading-[normal] ${bit.on ? 'font-semibold text-ink' : 'text-ink3'}`}>{bit.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[15px] text-ink">{sum}</p>
    </div>
  );
}

function Utf8Table({ chars }: { chars: string[] }) {
  const cell = 'border-b border-rule px-2 py-1.5';
  const head = 'border-b border-rule px-2 py-1 text-left text-[12px] font-semibold text-ink3';
  return (
    <table className="w-full border-collapse text-[14px]">
      <thead>
        <tr>
          <th className={head}>Character</th>
          <th className={head}>Stored as</th>
          <th className={head}>Bytes</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {utf8Rows(chars).map((row) => (
          <tr key={row.char}>
            <td className={`${cell} ${row.char.length > 2 ? '' : 'text-[18px]'}`}>{row.char}</td>
            <td className={cell}>{row.bytes}</td>
            <td className={cell}>{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HonestyLabelList() {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2.5">
      {HONESTY_LABELS.map((label) => (
        <div className="contents" key={label.name}>
          <dt>
            <HonestyChipText label={label} />
          </dt>
          <dd className="text-[14px] leading-[1.55] text-ink2">{label.means}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The picture under a Concept card's text. */
export function ConceptVisualView({ visual }: { visual: ConceptVisual }) {
  switch (visual.kind) {
    case 'bits':
      return (
        <div>
          <Bits value={visual.value} />
          {visual.note && (
            <p className="mt-1 text-[14px] text-ink2">
              <ExplanationText spans={textSpans(visual.note)} />
            </p>
          )}
        </div>
      );
    case 'utf8':
      return <Utf8Table chars={visual.chars} />;
    case 'honestyLabels':
      return <HonestyLabelList />;
  }
}
