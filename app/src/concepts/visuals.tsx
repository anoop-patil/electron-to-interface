import { fillString, template, textSpans } from '../explain/explain';
import { pixelsFacts } from '../explain/pixels';
import { ExplanationText } from '../explain/ExplanationText';
import type { ConceptVisual } from '../generated/analysis';
import { useScreen } from '../screen';
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

/** The three numbered doors every program is given, each with what it leads to, and the one in use, if any, highlighted. */
export function Doors({ doors, used }: { doors: string[]; used?: number }) {
  return (
    <ul className="grid grid-cols-3 gap-2 narrow:grid-cols-1">
      {doors.map((leads, door) => (
        <li
          key={door}
          className={`rounded-[10px] border-[1.5px] px-3 py-2.5 text-[13px] leading-[1.45] text-ink2 ${door === used ? 'border-accent bg-accent-soft' : 'border-rule2 bg-surface'}`}
          aria-current={door === used || undefined}
        >
          <b className="block font-mono text-[20px] font-semibold text-ink">{door}</b>
          {leads}
        </li>
      ))}
    </ul>
  );
}

/** The learner's own screen: how many pixels their browser reports it has. */
function YourScreen() {
  const { pixels } = useScreen();
  return (
    <p className="rounded-[10px] border border-rule bg-sunk px-3.5 py-2.5 text-[14px] text-ink2 [&_b]:text-ink">
      <ExplanationText spans={fillString(template('screen.yours', 'pixels').text, pixelsFacts(pixels))} />
    </p>
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
    case 'doors':
      return <Doors doors={visual.doors} />;
    case 'screen':
      return <YourScreen />;
  }
}
