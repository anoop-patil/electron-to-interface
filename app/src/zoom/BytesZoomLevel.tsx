import { panelLabel } from '../concepts/concepts';
import { HonestyChip } from '../concepts/HonestyChip';
import { Bits } from '../concepts/visuals';
import { explainBits, explainProgram } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import type { Analysis, ByteFact } from '../generated/analysis';
import { charLabel, describeChar } from './characters';

// The panel's sentences, either side of the bits.
const PANEL_TEXT_CLASSES = 'max-w-[70ch] text-[14px] leading-[1.6] text-ink2';

const hex = (value: number) => value.toString(16).toUpperCase().padStart(2, '0');

const BYTE_CLASSES = 'flex min-h-16 w-full cursor-pointer flex-col items-center gap-px rounded-lg border-[1.5px] px-0 py-1.5 text-ink';
// The selected byte, the other bytes of the same character, and the rest.
// A plain box-shadow, not Tailwind's `ring`: the ring's five stacked shadows shade rounded corners slightly differently.
const BYTE_STATE_STYLES = {
  selected: { byte: 'border-accent bg-accent-soft [box-shadow:0_0_0_3px_var(--accent-soft)]', number: 'text-ink2' },
  related: { byte: 'border-accent bg-transparent', number: 'text-ink3' },
  other: { byte: 'border-rule2 bg-transparent hover:border-ink3', number: 'text-ink3' },
};

/** Zoom level 2: the Program's bytes, line by line, each linked to the character it encodes. */
export function BytesZoomLevel({
  analysis,
  selectedByte,
  onSelect,
}: {
  analysis: Analysis;
  selectedByte: ByteFact | null;
  onSelect(byte: ByteFact): void;
}) {
  const chars = Array.from(analysis.program);
  const lines = new Map<number, { byte: ByteFact; position: number }[]>();
  analysis.bytes.forEach((byte, position) => {
    if (!lines.has(byte.line)) lines.set(byte.line, []);
    lines.get(byte.line)!.push({ byte, position });
  });

  return (
    <>
      <p className="mb-3.5 text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level2.caption', analysis).text} />
      </p>
      <div className="grid gap-2.5">
        {[...lines].map(([line, bytes]) => (
          <div className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-2 narrow:grid-cols-[minmax(0,1fr)]" key={line}>
            <span className="pt-2.5 font-mono text-[12px] leading-[normal] text-ink3 narrow:pt-0" aria-hidden="true">line {line}</span>
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5" aria-label={`Line ${line}`}>
              {bytes.map(({ byte, position }) => {
                const char = chars[byte.charIndex];
                const isSelected = byte.id === selectedByte?.id;
                const sharesChar = !isSelected && byte.charIndex === selectedByte?.charIndex;
                const styles = BYTE_STATE_STYLES[isSelected ? 'selected' : sharesChar ? 'related' : 'other'];
                return (
                  <li key={byte.id}>
                    <button
                      type="button"
                      className={`${BYTE_CLASSES} ${styles.byte}`}
                      data-fact-id={byte.id}
                      aria-pressed={isSelected}
                      aria-label={`Byte ${position + 1}: ${byte.value}, 0x${hex(byte.value)}, ${describeChar(char)}`}
                      onClick={() => onSelect(byte)}
                    >
                      <span className="font-mono text-[15px] font-semibold leading-[normal]">{hex(byte.value)}</span>
                      <span className={`font-mono text-[11px] leading-[normal] ${styles.number}`}>{byte.value}</span>
                      <span className="font-mono text-[13px] leading-[normal] text-ink2">{charLabel(char)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </>
  );
}

/** How the selected byte's number is stored as 8 bits. It is worked out from the byte, not recorded, so it carries its own label. */
export function BitsPanel({ analysis, byte }: { analysis: Analysis; byte: ByteFact }) {
  const { title, text, pattern } = explainBits(analysis, byte);
  return (
    <section className="grid min-w-0 max-w-[780px] gap-2.5 rounded-xl border border-rule bg-sunk px-4 py-3.5" aria-labelledby="bits-title">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="bits-title" className="text-[13px] font-semibold text-ink2">
          <ExplanationText spans={title} />
        </h3>
        <HonestyChip label={panelLabel('byteBits')} size="panel" />
      </div>
      <p className={PANEL_TEXT_CLASSES}>
        <ExplanationText spans={text} />
      </p>
      <Bits value={byte.value} />
      <p className={PANEL_TEXT_CLASSES}>
        <ExplanationText spans={pattern} />
      </p>
    </section>
  );
}
