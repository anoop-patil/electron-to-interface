import type { Analysis, ByteFact } from '../generated/analysis';
import { charLabel, describeChar } from './characters';

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
        Your program as a file: {analysis.bytes.length} bytes, numbers from 0 to 255, shown line by line. Each
        box shows the byte in hexadecimal, then as an ordinary number. Select one to see its character.
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
